// CRITICAL: bootstrap must be the first import — it runs dotenv.config() before
// any module that reads process.env (config/index.ts, modelConfig.ts, etc.).
// ES modules execute imports in order, so anything listed above this line would
// observe process.env *before* .env is loaded.
import './bootstrap.js';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { ExtractionResult } from '@ara/shared';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { config, logConfig, getEnvironmentInfo } from './config/index.js';
import { closeDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { logger, createProgressTracker } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestTracking, setupGracefulShutdown } from './middleware/gracefulShutdown.js';
import { extractionRateLimit, exportRateLimit, healthRateLimit, circuitBreakerMiddleware, llmCircuitBreaker } from './middleware/rateLimit.js';
import { requestLogger, performanceLogger } from './middleware/requestLogger.js';
import { securityHeaders, configureCors, requestId, securityAudit } from './middleware/security.js';
import {
  validateRequest, validateFileRequest, sanitizeRequest,
  ExtractFillSchema, ExportPDFSchema, SummarizeSchema,
  CreatePatientSchema, UpdatePatientSchema,
  CreateFolderSchema, UpdateFolderSchema,
  LinkPatientFolderSchema, CreateSessionSchema,
  MigrateLocalStorageSchema,
  EmbedSchema, RagQuerySchema,
  CreateChatTurnSchema,
} from './middleware/validation.js';
import { DEFAULT_MODEL, OLLAMA_BASE_URL, checkModelAvailable } from './modelConfig.js';
import { fillNarrativeWithQA } from './narrativeQA.js';
import { extractTextFromFile } from './ocr.js';
import { checkOllamaHealth, listModels } from './ollama.js';
import {
  createPatient, listPatients, getPatient, updatePatient, deletePatient,
  createFolder, listFolders, getFolder, updateFolder, deleteFolder,
  addPatientToFolder, removePatientFromFolder,
  createSession, listSessionsForPatient, getSession, deleteSession,
  createSummary, listSummariesForSession, getSummary, getPatientWithSessions,
  createChatTurn, listChatTurnsForPatient, deleteChatTurn,
  getOrCreateUnassignedPatient, importLegacyHistoryItems,
} from './patientStore.js';
import { generateProfessionalPDF } from './pdfGenerator.js';
import { getProgress } from './progressStore.js';
import { seedDefaultPrompts, listPrompts, getPromptRecord, setPromptBody, resetPrompt } from './promptStore.js';
import { queryRagContext, embedSessionAndSummary } from './rag.js';
import { summarizeCaregiverNotes } from './summarizer.js';
import { validateForm, autoFormatDate, autoFormatTime, applySmartDefaults } from './validation.js';
import { warmupModel, isWarmedUp, startKeepAlive, triggerBackgroundWarmup } from './warmup.js';

const app = express();

// Apply DB migrations + seed default prompts before any route is served.
// Both are idempotent so restarting the service is safe.
runMigrations();
seedDefaultPrompts();

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
app.use(sanitizeRequest);

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
      pooling: config.ollama.pool.enabled,
      gpu: config.ollama.gpu.enabled,
    },
  });
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
  upload.single('file'),
  validateFileRequest,
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

// Summarize endpoint - generate human-readable summary of raw text (paste / typed input).
// This is the primary output path in the Phase 1 refactor: input text -> summary.
app.post('/summarize',
  extractionRateLimit,
  validateRequest(SummarizeSchema),
  async (req, res, _next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  const startTime = Date.now();
  // Progress tracker so the frontend can poll GET /progress/SUMMARIZE while this runs.
  const progress = createProgressTracker('SUMMARIZE');

  try {
    const { text } = req.body;

    if (!text) {
      logger.warn('[SUMMARIZE] No text provided', { requestId });
      progress.error('No text provided');
      return res.status(400).json({ error: 'No text provided' });
    }
    logger.info('[SUMMARIZE] Request received:', {
      requestId,
      textLength: text.length,
    });

    progress.start('Preparing text');

    // Phase 4: retrieve prior patient context for RAG when a patient is selected.
    let ragContext: string | undefined;
    const patientId = (req.body as { patientId?: number }).patientId;
    if (patientId && typeof patientId === 'number') {
      try {
        const rag = await queryRagContext(patientId, text, 3);
        ragContext = rag.context || undefined;
        logger.info('[SUMMARIZE] RAG context retrieved', { patientId, sources: rag.sources.length });
      } catch (ragErr) {
        logger.warn('[SUMMARIZE] RAG retrieval failed (non-fatal)', {
          patientId,
          error: ragErr instanceof Error ? ragErr.message : String(ragErr),
        });
      }
    }

    // Forward summarizer progress stages (10-100%) into the shared progress store.
    const summary = await summarizeCaregiverNotes(text, {
      onProgress: (p) => {
        progress.update(p.percent, p.message);
        logger.info(`[SUMMARIZE] Progress: ${p.stage} (${p.percent}%) - ${p.message}`);
      },
      context: ragContext,
    });
    
    const duration = Date.now() - startTime;
    logger.info('[SUMMARIZE] Complete:', {
      requestId,
      duration: `${duration}ms`,
      summaryLength: summary.summary.length,
    });

    progress.complete('Summary ready');

    // Phase 3: optionally persist session + summary when a patient is specified.
    let sessionId: number | undefined;
    let summaryId: number | undefined;
    if (patientId && typeof patientId === 'number' && !summary.isFallback) {
      try {
        const session = createSession(patientId, 'text', text);
        sessionId = session.id;
        const summaryRecord = createSummary(session.id, summary.summary, 'summarizer.main', DEFAULT_MODEL);
        summaryId = summaryRecord.id;
        logger.info('[SUMMARIZE] Persisted to DB', { patientId, sessionId, summaryId });

        // Phase 4: background embedding for RAG.
        embedSessionAndSummary(session.id, text, summaryRecord.id, summary.summary).catch(() => {});
      } catch (dbErr) {
        logger.warn('[SUMMARIZE] DB persistence failed (non-fatal)', {
          patientId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    // Include rawText in the response so the frontend can show both original + summary
    // without re-sending the input.
    res.json({ ...summary, rawText: text, sessionId, summaryId });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('[SUMMARIZE] Error:', {
      requestId,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    progress.error(error instanceof Error ? error.message : 'Unknown error');

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

// Summarize file endpoint - file upload -> OCR -> summary.
// Matches the /summarize JSON shape (returns { summary, rawText, ... }) so the
// frontend uses one code path for both text and file inputs.
app.post('/summarize/file',
  extractionRateLimit,
  upload.single('file'),
  validateFileRequest,
  async (req, res, next) => {
  const requestId = (req as unknown as Record<string, string>).id;
  // Single progress channel covers both OCR and summarization stages.
  const progress = createProgressTracker('SUMMARIZE');

  try {
    if (!req.file) {
      logger.warn('Summarize-file request without file', { requestId });
      return res.status(400).json({ error: 'No file provided' });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    const originalName = req.file.originalname;

    logger.info('[SUMMARIZE/FILE] Starting', { requestId, file: originalName, type: fileType });

    progress.start(`Reading ${originalName}`);
    progress.update(5, 'OCR starting');

    // OCR pass. Reserve 5-45% of the progress bar for OCR; summarization uses 45-100%.
    const ocrResult = await extractTextFromFile(filePath, fileType);
    progress.update(45, `OCR complete (${ocrResult.confidence.toFixed(1)}% confidence)`);

    logger.info('[SUMMARIZE/FILE] OCR complete', {
      requestId,
      method: ocrResult.method,
      confidence: ocrResult.confidence.toFixed(1),
      textLength: ocrResult.text.length,
    });

    // Clean up the uploaded file early — we now have the text in memory.
    await fs.unlink(filePath).catch(err =>
      logger.warn('Upload cleanup failed', { path: filePath, error: (err as Error).message })
    );

    // Phase 4: retrieve prior patient context for RAG when a patient is selected.
    let ragContext: string | undefined;
    const patientId = (req.body as { patientId?: string | number }).patientId;
    const parsedPatientId = patientId ? Number(patientId) : undefined;
    if (parsedPatientId && !isNaN(parsedPatientId)) {
      try {
        const rag = await queryRagContext(parsedPatientId, ocrResult.text, 3);
        ragContext = rag.context || undefined;
        logger.info('[SUMMARIZE/FILE] RAG context retrieved', { patientId: parsedPatientId, sources: rag.sources.length });
      } catch (ragErr) {
        logger.warn('[SUMMARIZE/FILE] RAG retrieval failed (non-fatal)', {
          patientId: parsedPatientId,
          error: ragErr instanceof Error ? ragErr.message : String(ragErr),
        });
      }
    }

    // Summarize the OCR output. Map summarizer progress (0-100) into 45-100 of our bar.
    const summary = await summarizeCaregiverNotes(ocrResult.text, {
      onProgress: (p) => {
        const mapped = 45 + Math.round(p.percent * 0.55);
        progress.update(mapped, p.message);
      },
      context: ragContext,
    });

    progress.complete('Summary ready');

    // Phase 3: optionally persist session + summary when a patient is specified.
    let sessionId: number | undefined;
    let summaryId: number | undefined;
    if (parsedPatientId && !isNaN(parsedPatientId) && !summary.isFallback) {
      try {
        const session = createSession(parsedPatientId, 'ocr', ocrResult.text);
        sessionId = session.id;
        const summaryRecord = createSummary(session.id, summary.summary, 'summarizer.main', DEFAULT_MODEL);
        summaryId = summaryRecord.id;
        logger.info('[SUMMARIZE/FILE] Persisted to DB', { patientId: parsedPatientId, sessionId, summaryId });

        // Phase 4: background embedding for RAG.
        embedSessionAndSummary(session.id, ocrResult.text, summaryRecord.id, summary.summary).catch(() => {});
      } catch (dbErr) {
        logger.warn('[SUMMARIZE/FILE] DB persistence failed (non-fatal)', {
          patientId: parsedPatientId,
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    res.json({ ...summary, rawText: ocrResult.text, sessionId, summaryId });
  } catch (error) {
    progress.error(error instanceof Error ? error.message : 'Unknown error');
    logger.error('[SUMMARIZE/FILE] Error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    // Clean up on error.
    if (req.file) {
      await fs.unlink(req.file.path).catch(err =>
        logger.warn('Upload cleanup failed', { path: req.file!.path, error: (err as Error).message })
      );
    }

    next(error);
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
    const { rawText } = req.body;
    
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

    logger.info('Starting PDF export', { requestId });

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

// Prompts CRUD (Phase 2). Backs the Settings → Prompts editor in the desktop
// app. Every prompt the service uses is resolvable by name here, and edits
// take effect on the next inference — no restart.
app.get('/prompts', (_req, res) => {
  res.json({ prompts: listPrompts() });
});

app.get('/prompts/:name', (req, res) => {
  const record = getPromptRecord(req.params.name);
  if (!record) return res.status(404).json({ error: 'Unknown prompt' });
  res.json(record);
});

app.put('/prompts/:name', (req, res) => {
  const body = req.body?.body;
  // We accept empty strings (user may want a deliberately minimal prompt) but
  // reject non-strings outright — a number or object here means the caller is
  // confused about the API shape.
  if (typeof body !== 'string') {
    return res.status(400).json({ error: 'Request body must have a string "body" field' });
  }
  const updated = setPromptBody(req.params.name, body);
  if (!updated) return res.status(404).json({ error: 'Unknown prompt' });
  res.json(updated);
});

app.post('/prompts/:name/reset', (req, res) => {
  const updated = resetPrompt(req.params.name);
  if (!updated) return res.status(404).json({ error: 'Unknown prompt' });
  res.json(updated);
});

// ============================================================================
// Patient / Folder / Session / Summary CRUD (Phase 3)
// ============================================================================

// --- Patients ---

app.get('/patients', (_req, res) => {
  res.json({ patients: listPatients() });
});

app.post('/patients', validateRequest(CreatePatientSchema), (req, res) => {
  const { displayName } = req.validatedBody as z.infer<typeof CreatePatientSchema>;
  const patient = createPatient(displayName);
  res.status(201).json(patient);
});

app.get('/patients/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });
  const patient = getPatientWithSessions(id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(patient);
});

app.put('/patients/:id', validateRequest(UpdatePatientSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });
  const { displayName } = req.validatedBody as z.infer<typeof UpdatePatientSchema>;
  const updated = updatePatient(id, displayName);
  if (!updated) return res.status(404).json({ error: 'Patient not found' });
  res.json(updated);
});

app.delete('/patients/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid patient ID' });
  const removed = deletePatient(id);
  if (!removed) return res.status(404).json({ error: 'Patient not found' });
  res.status(204).send();
});

// --- Folders ---

app.get('/folders', (_req, res) => {
  res.json({ folders: listFolders() });
});

app.post('/folders', validateRequest(CreateFolderSchema), (req, res) => {
  const { name } = req.validatedBody as z.infer<typeof CreateFolderSchema>;
  const folder = createFolder(name);
  res.status(201).json(folder);
});

app.put('/folders/:id', validateRequest(UpdateFolderSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid folder ID' });
  const { name } = req.validatedBody as z.infer<typeof UpdateFolderSchema>;
  const updated = updateFolder(id, name);
  if (!updated) return res.status(404).json({ error: 'Folder not found' });
  res.json(updated);
});

app.delete('/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid folder ID' });
  const removed = deleteFolder(id);
  if (!removed) return res.status(404).json({ error: 'Folder not found' });
  res.status(204).send();
});

// --- Patient ↔ Folder links ---

app.post('/patients/:id/folders', validateRequest(LinkPatientFolderSchema), (req, res) => {
  const patientId = Number(req.params.id);
  const { folderId } = req.validatedBody as z.infer<typeof LinkPatientFolderSchema>;
  if (!patientId || isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const patient = getPatient(patientId);
  const folder = getFolder(folderId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  addPatientToFolder(patientId, folderId);
  res.status(204).send();
});

app.delete('/patients/:id/folders/:folderId', (req, res) => {
  const patientId = Number(req.params.id);
  const folderId = Number(req.params.folderId);
  if (!patientId || isNaN(patientId) || !folderId || isNaN(folderId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }
  removePatientFromFolder(patientId, folderId);
  res.status(204).send();
});

// --- Sessions ---

app.get('/patients/:id/sessions', (req, res) => {
  const patientId = Number(req.params.id);
  if (!patientId || isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const sessions = listSessionsForPatient(patientId);
  res.json({ sessions });
});

app.post('/sessions', validateRequest(CreateSessionSchema), (req, res) => {
  const { patientId, source, rawText } = req.validatedBody as z.infer<typeof CreateSessionSchema>;
  const patient = getPatient(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const session = createSession(patientId, source, rawText);
  res.status(201).json(session);
});

app.get('/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const summaries = listSummariesForSession(id);
  res.json({ ...session, summaries });
});

app.delete('/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
  const removed = deleteSession(id);
  if (!removed) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

// --- Summaries ---

app.get('/sessions/:id/summaries', (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionId || isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });
  const summaries = listSummariesForSession(sessionId);
  res.json({ summaries });
});

app.get('/summaries/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid summary ID' });
  const summary = getSummary(id);
  if (!summary) return res.status(404).json({ error: 'Summary not found' });
  res.json(summary);
});

// --- Chat turns ---

app.get('/patients/:id/chat-turns', (req, res) => {
  const patientId = Number(req.params.id);
  if (!patientId || isNaN(patientId)) return res.status(400).json({ error: 'Invalid patient ID' });
  const turns = listChatTurnsForPatient(patientId);
  res.json({ turns });
});

app.post('/chat-turns', validateRequest(CreateChatTurnSchema), (req, res) => {
  const { patientId, role, body } = req.validatedBody as z.infer<typeof CreateChatTurnSchema>;
  const patient = getPatient(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const turn = createChatTurn(patientId, role, body);
  res.status(201).json(turn);
});

app.delete('/chat-turns/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid chat turn ID' });
  const removed = deleteChatTurn(id);
  if (!removed) return res.status(404).json({ error: 'Chat turn not found' });
  res.status(204).send();
});

// --- One-time localStorage → DB migration ---

app.post('/migrate/localstorage', validateRequest(MigrateLocalStorageSchema), (req, res) => {
  const { items } = req.validatedBody as z.infer<typeof MigrateLocalStorageSchema>;
  const patientId = getOrCreateUnassignedPatient();
  const result = importLegacyHistoryItems(
    patientId,
    items.map(i => ({
      rawText: i.rawText,
      summary: i.summary,
      timestamp: i.timestamp,
      source: i.source,
    }))
  );
  res.json({ migrated: true, patientId, ...result });
});

// --- RAG endpoints (Phase 4) ---

app.post('/embed', validateRequest(EmbedSchema), async (req, res, next) => {
  try {
    const { text } = req.validatedBody as z.infer<typeof EmbedSchema>;
    const { embedText } = await import('./rag.js');
    const vector = await embedText(text);
    res.json({
      model: config.ollama.embedModel,
      dimensions: vector.length,
      vector: Array.from(vector),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/rag/query', validateRequest(RagQuerySchema), async (req, res, next) => {
  try {
    const { patientId, query, k } = req.validatedBody as z.infer<typeof RagQuerySchema>;
    const { queryRagContext } = await import('./rag.js');
    const result = await queryRagContext(patientId, query, k);
    res.json(result);
  } catch (error) {
    next(error);
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
  console.log('  POST /extract/pdf        - Extract OCR from PDF/image + fill form');
  console.log('  POST /summarize          - Summarize raw text (primary Phase 1 output)');
  console.log('  POST /summarize/file     - OCR a file and summarize (primary Phase 1 output)');
  console.log('  POST /extract/fill       - Fill form using AI (opt-in form path)');
  console.log('  GET  /prompts            - List editable prompts');
  console.log('  PUT  /prompts/:name      - Update a prompt body');
  console.log('  POST /export/pdf         - Generate filled PDF');
  console.log('  GET  /progress/:operation - Get operation progress');
  console.log('  GET  /template/:v/map    - Get template mapping');
  console.log('  GET  /patients           - List patients');
  console.log('  POST /patients           - Create patient');
  console.log('  GET  /patients/:id       - Get patient with sessions');
  console.log('  PUT  /patients/:id       - Update patient');
  console.log('  DELETE /patients/:id     - Delete patient');
  console.log('  GET  /folders            - List folders');
  console.log('  POST /folders            - Create folder');
  console.log('  PUT  /folders/:id        - Update folder');
  console.log('  DELETE /folders/:id      - Delete folder');
  console.log('  GET  /patients/:id/sessions - List patient sessions');
  console.log('  POST /sessions           - Create session');
  console.log('  GET  /sessions/:id       - Get session with summaries');
  console.log('  GET  /sessions/:id/summaries - List session summaries');
  console.log('  GET  /summaries/:id      - Get summary');
  console.log('  POST /migrate/localstorage - Migrate localStorage history to DB');
  console.log('  POST /embed              - Embed text to vector');
  console.log('  POST /rag/query          - RAG context retrieval');
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
  logger.info('Running shutdown cleanup...');
  // Flushes SQLite WAL and releases the file handle so the DB isn't locked
  // if the next start happens quickly (common during dev reloads).
  closeDb();
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


