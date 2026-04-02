import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { extractTextFromFile } from './ocr.js';
import { checkOllamaHealth, listModels, getCacheStats, clearLLMCache } from './ollama.js';
import { generateProfessionalPDF } from './pdfGenerator.js';
import { fillNarrativeWithQA } from './narrativeQA.js';
import { logger, createProgressTracker } from './logger.js';
import { getProgress } from './progressStore.js';
import { summarizeCaregiverNotes } from './summarizer.js';
import { warmupModel, isWarmedUp, startKeepAlive, triggerBackgroundWarmup } from './warmup.js';
import { DEFAULT_MODEL, OLLAMA_BASE_URL, checkModelAvailable } from './modelConfig.js';
import { config, logConfig, getEnvironmentInfo } from './config/index.js';
import { requestLogger, performanceLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { securityHeaders, configureCors, requestId, securityAudit } from './middleware/security.js';
import { extractionRateLimit, exportRateLimit, healthRateLimit, circuitBreakerMiddleware, llmCircuitBreaker } from './middleware/rateLimit.js';
import { validateRequest, validateFileRequest, ExtractFillSchema, ExportPDFSchema, SummarizeSchema } from './middleware/validation.js';
import { requestTracking, setupGracefulShutdown } from './middleware/gracefulShutdown.js';
import type { ExtractionResult } from '@ara/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', config.upload.tempDir);
await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const upload = multer({ 
  dest: uploadsDir,
  limits: { fileSize: config.ocr.maxFileSize },
});

// Security middleware (before all routes)
app.use(requestId);
app.use(securityHeaders);
app.use(configureCors({ allowedOrigins: ['http://localhost:1420', 'http://localhost:3000'] }));
app.use(express.json({ limit: '10mb' }));

// Request tracking for graceful shutdown
app.use(requestTracking);

// Logging middleware
app.use(requestLogger);
app.use(performanceLogger(5000));
app.use(securityAudit);

// Health check endpoint
app.get('/health', healthRateLimit, async (_req, res) => {
  logger.debug('Health check requested');
  const ollamaStatus = await checkOllamaHealth();
  const models = ollamaStatus ? await listModels() : [];
  const configuredModel = DEFAULT_MODEL;
  const modelAvailable = await checkModelAvailable(configuredModel);
  
  // Trigger warmup if not already done
  if (!isWarmedUp() && ollamaStatus && modelAvailable) {
    triggerBackgroundWarmup();
  }
  
  res.json({
    status: 'ok',
    ollama: ollamaStatus ? 'connected' : 'disconnected',
    model: {
      configured: configuredModel,
      available: modelAvailable,
      warmedUp: isWarmedUp(),
    },
    models: models.slice(0, 5),
    optimizations: {
      caching: config.ollama.cache.enabled,
      pooling: config.ollama.pool.enabled,
      gpu: config.ollama.gpu.enabled,
    },
  });
});

// Cache management endpoints
app.get('/admin/cache', healthRateLimit, (_req, res) => {
  const stats = getCacheStats();
  res.json({
    enabled: config.ollama.cache.enabled,
    ...stats,
    config: {
      ttl: config.ollama.cache.ttl,
      maxSize: config.ollama.cache.maxSize,
    },
  });
});

app.post('/admin/cache/clear', healthRateLimit, (_req, res) => {
  clearLLMCache();
  res.json({ message: 'Cache cleared successfully' });
});

// Performance/optimization status
app.get('/admin/performance', healthRateLimit, (_req, res) => {
  res.json({
    ollama: {
      gpu: {
        enabled: config.ollama.gpu.enabled,
        numGpuLayers: config.ollama.gpu.numGpuLayers,
        mainGpu: config.ollama.gpu.mainGpu,
      },
      performance: {
        numThread: config.ollama.performance.numThread,
        numBatch: config.ollama.performance.numBatch,
        numPredict: config.ollama.performance.numPredict,
      },
      cache: {
        enabled: config.ollama.cache.enabled,
        ...getCacheStats(),
      },
      pool: {
        enabled: config.ollama.pool.enabled,
        maxSockets: config.ollama.pool.maxSockets,
      },
    },
  });
});

// OCR endpoint for PDFs and images
app.post('/extract/pdf',
  extractionRateLimit,
  validateFileRequest,
  upload.single('file'),
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  const progress = createProgressTracker('EXTRACT');
  
  try {
    if (!req.file) {
      logger.warn('Extract request without file', { requestId });
      return res.status(400).json({ error: 'No file provided' });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    logger.info('Starting extraction', { 
      requestId, 
      file: originalName, 
      type: fileType,
      size: `${(fileSize / 1024 / 1024).toFixed(2)}MB`
    });
    
    progress.start(`Processing ${originalName}`);
    progress.update(5, 'File uploaded, starting OCR');

    // Extract text using OCR
    const ocrResult = await extractTextFromFile(filePath, fileType);
    progress.update(50, `OCR complete (${ocrResult.confidence.toFixed(1)}% confidence)`);
    
    logger.info('OCR complete', {
      requestId,
      method: ocrResult.method,
      confidence: ocrResult.confidence.toFixed(1),
      pages: ocrResult.pageCount,
      textLength: ocrResult.text.length
    });

    // Check if we should use vision LLM
    const isImage = fileType.startsWith('image/');
    const poorOcr = ocrResult.confidence < 50;
    const useVision = isImage && poorOcr;
    
    if (useVision) {
      logger.info('Low OCR confidence, will try vision LLM', { 
        requestId, 
        confidence: ocrResult.confidence 
      });
    }

    // Use AI to fill the form from the extracted text
    progress.update(55, 'Analyzing with AI...');
    
    const fillResult = await fillNarrativeWithQA(ocrResult.text, (stage, percent) => {
      progress.update(55 + Math.round(percent * 0.4), stage);
    });
    
    progress.update(95, 'Finalizing results');
    logger.info('AI fill complete', {
      requestId,
      method: fillResult.extractionMethod,
      fieldsExtracted: Object.keys(fillResult.form).length
    });

    const result: ExtractionResult = {
      form: fillResult.form,
      confidence: fillResult.confidence,
      rawText: ocrResult.text,
      extractionMethod: fillResult.extractionMethod,
      ollamaAvailable: fillResult.ollamaAvailable,
    };

    // Clean up uploaded file
    await fs.unlink(filePath).catch(err => logger.warn('Upload cleanup failed', { path: filePath, error: (err as Error).message }));
    
    progress.complete('Extraction successful');
    logger.info('Request complete', { requestId });

    res.json(result);
  } catch (error) {
    progress.error(error instanceof Error ? error.message : 'Unknown error');
    logger.error('Extraction error', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown' 
    });
    
    // Clean up on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => logger.warn('Upload cleanup failed', { path: req.file!.path, error: (err as Error).message }));
    }
    
    next(error);
  }
});

// Summarize endpoint - generate human-readable summary of OCR text
app.post('/summarize',
  extractionRateLimit,
  validateRequest(SummarizeSchema),
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  const startTime = Date.now();
  
  try {
    const { text } = req.body;
    
    if (!text) {
      logger.warn('[SUMMARIZE] No text provided', { requestId });
      return res.status(400).json({ error: 'No text provided' });
    }
    logger.info('[SUMMARIZE] Request received:', {
      requestId,
      textLength: text.length,
    });
    
    // Log progress stages
    const summary = await summarizeCaregiverNotes(text, (progress) => {
      logger.info(`[SUMMARIZE] Progress: ${progress.stage} (${progress.percent}%) - ${progress.message}`);
    });
    
    const duration = Date.now() - startTime;
    logger.info('[SUMMARIZE] Complete:', { 
      requestId, 
      duration: `${duration}ms`,
      summaryLength: summary.summary.length,
      hasKeyPoints: summary.keyPoints.length > 0,
      hasConcerns: summary.concerns.length > 0,
      hasActions: summary.actions.length > 0
    });
    
    res.json(summary);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[SUMMARIZE] Error:', { 
      requestId, 
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown'
    });
    
    // Return graceful error response
    res.status(500).json({
      error: {
        code: 'SUMMARIZATION_FAILED',
        message: 'Summary generation failed',
        status: 500,
        fallback: {
          summary: 'Summary generation failed. Please review the original text.',
          keyPoints: ['Error occurred during processing'],
          concerns: [],
          actions: ['Review text manually'],
        },
        timestamp: new Date().toISOString(),
      }
    });
  }
});

// Extract and fill endpoint - takes raw OCR text and fills form with focused narrative Q&A
app.post('/extract/fill',
  extractionRateLimit,
  circuitBreakerMiddleware(llmCircuitBreaker),
  validateRequest(ExtractFillSchema),
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  const progress = createProgressTracker('FILL');
  
  try {
    const { rawText, ocrConfidence = 50 } = req.body;
    
    if (!rawText) {
      return res.status(400).json({ error: 'No raw text provided' });
    }

    logger.info('Filling form using focused narrative Q&A', { requestId, textLength: rawText.length });
    progress.start('Starting AI narrative analysis');
    
    // Use focused narrative Q&A (3 key questions)
    progress.update(20, 'AI is reading transcript and analyzing narrative sections');
    
    const qaResult = await fillNarrativeWithQA(rawText, (stage, percent) => {
      progress.update(20 + Math.round(percent * 0.7), stage);
    });
    
    progress.update(90, 'Building form with AI responses');
    
    logger.info('Form filling complete', { 
      requestId, 
      method: qaResult.extractionMethod,
      recipientName: qaResult.form.header.recipientName,
      date: qaResult.form.header.date,
      hasObservations: qaResult.form.narrative.recipientAndVisitObservations.length > 20,
      hasHealthStatus: qaResult.form.narrative.healthEmotionalStatus.length > 20,
      hasServices: qaResult.form.narrative.reviewOfServices.length > 20,
      hasGoals: qaResult.form.narrative.progressTowardGoals.length > 20,
      hasFollowUp: qaResult.form.narrative.followUpTasks.length > 20,
    });
    
    progress.complete('Form ready');

    const result: ExtractionResult = {
      form: qaResult.form,
      confidence: qaResult.confidence,
      rawText: rawText,
      extractionMethod: qaResult.extractionMethod,
      ollamaAvailable: qaResult.ollamaAvailable,
      keySections: qaResult.keySections,
      qaAnswers: qaResult.qaAnswers,
    };

    res.json(result);
  } catch (error) {
    progress.error(error instanceof Error ? error.message : 'Unknown error');
    next(error);
  }
});

// Export endpoint - generate professional PDF
app.post('/export/pdf',
  exportRateLimit,
  validateRequest(ExportPDFSchema),
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  
  try {
    const { form } = req.body;
    
    if (!form) {
      logger.warn('Export request without form data', { requestId });
      return res.status(400).json({ error: 'No form data provided' });
    }

    logger.info('Starting PDF export', { 
      requestId, 
      recipient: form.header?.recipientName || 'unknown'
    });

    // Generate professional PDF
    const pdfBuffer = await generateProfessionalPDF(form);
    
    logger.info('PDF export complete', { 
      requestId, 
      size: `${(pdfBuffer.length / 1024).toFixed(2)}KB` 
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="care-coordination-form.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Get progress for an operation
app.get('/progress/:operation', (req, res) => {
  const { operation } = req.params;
  const progress = getProgress(operation);
  
  if (!progress) {
    return res.status(404).json({ error: 'Operation not found or expired' });
  }
  
  res.json(progress);
});

// Validation endpoint - validate form data
import { validateForm, autoFormatDate, autoFormatTime, applySmartDefaults, type ValidationResult } from './validation.js';

app.post('/validate', (req, res) => {
  const { form } = req.body;
  
  if (!form) {
    return res.status(400).json({ error: 'No form data provided' });
  }
  
  const result = validateForm(form);
  res.json(result);
});

// Auto-format endpoint
app.post('/format', (req, res) => {
  const { value, type } = req.body;
  
  if (!value || !type) {
    return res.status(400).json({ error: 'Value and type required' });
  }
  
  let formatted = value;
  if (type === 'date') {
    formatted = autoFormatDate(value);
  } else if (type === 'time') {
    formatted = autoFormatTime(value);
  }
  
  res.json({ formatted });
});

// Smart defaults endpoint
app.post('/defaults', (req, res) => {
  const { form } = req.body;
  
  if (!form) {
    return res.status(400).json({ error: 'No form data provided' });
  }
  
  const defaults = applySmartDefaults(form);
  res.json({ defaults });
});

// PDF Preview endpoint - returns base64 for preview
app.post('/export/preview',
  exportRateLimit,
  validateRequest(ExportPDFSchema),
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  
  try {
    const { form } = req.body;
    
    if (!form) {
      return res.status(400).json({ error: 'No form data provided' });
    }

    logger.info('Starting PDF preview generation', { requestId });
    
    // Generate PDF (reuse existing generator)
    const pdfBuffer = await generateProfessionalPDF(form);
    const base64 = pdfBuffer.toString('base64');
    
    logger.info('PDF preview complete', { requestId, size: `${(pdfBuffer.length / 1024).toFixed(2)}KB` });
    
    res.json({ 
      preview: base64,
      size: pdfBuffer.length 
    });
  } catch (error) {
    next(error);
  }
});

// Get template mapping
const ALLOWED_TEMPLATE_VERSIONS = new Set(['mccmc_v1', 'mccmc_v2']);

app.get('/template/:version/mapping', async (req, res) => {
  try {
    const { version } = req.params;

    if (!ALLOWED_TEMPLATE_VERSIONS.has(version)) {
      return res.status(400).json({ error: `Unknown template version: ${version}` });
    }

    logger.debug('Template mapping requested', { version });

    const mappingPath = path.join(__dirname, '..', '..', '..', 'templates', version, 'mapping.json');
    const mapping = await fs.readFile(mappingPath, 'utf-8');
    res.json(JSON.parse(mapping));
  } catch (error) {
    logger.error('Template not found', {
      version: req.params.version,
      error: error instanceof Error ? error.message : 'Unknown'
    });
    res.status(404).json({ error: 'Template not found' });
  }
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.server.port;

const server = app.listen(PORT, async () => {
  // Log config on startup
  logConfig();
  logger.info('Environment', getEnvironmentInfo());

  console.log('');
  console.log('+----------------------------------------------------+');
  console.log('|   ARA Local AI Service                             |');
  console.log(`|   Port: ${PORT}                                    |`);
  console.log('+----------------------------------------------------+');
  console.log('');
  console.log('Model Configuration:');
  console.log(`  Model: ${DEFAULT_MODEL}`);
  console.log(`  Ollama: ${OLLAMA_BASE_URL}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health             - Health check');
  console.log('  POST /extract/pdf        - Extract OCR from PDF/image');
  console.log('  POST /summarize          - Generate AI summary of notes');
  console.log('  POST /extract/fill       - Fill form using AI');
  console.log('  POST /export/pdf         - Generate filled PDF');
  console.log('  GET  /progress/:operation - Get operation progress');
  console.log('  GET  /template/:v/map    - Get template mapping');
  console.log('');
  console.log('Environment:');
  console.log(`  LOG_LEVEL: ${config.server.logLevel}`);
  console.log('');
  
  // Warmup model on startup
  console.log('[STARTUP] Warming up AI model...');
  await warmupModel();
  
  // Start keep-alive to keep model loaded
  startKeepAlive(config.warmup.keepAliveInterval);
  
  console.log('[STARTUP] Ready for requests');
  console.log('');
});

// Setup graceful shutdown
setupGracefulShutdown(server, async () => {
  // Cleanup tasks
  logger.info('Running shutdown cleanup...');
  // Add any cleanup here (close DB connections, etc.)
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${PORT} is already in use.`);
    console.error('   Another instance of the service may be running.');
    console.error(`   Try: http://localhost:${PORT}/health`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});


