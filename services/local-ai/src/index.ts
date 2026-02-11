import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { extractTextFromFile } from './ocr.js';
import { parseFormFromText } from './parser.js';
import { checkOllamaHealth, listModels } from './ollama.js';
import { fillPDFForm } from './pdfExport.js';
import { logger, createProgressTracker } from './logger.js';
import { summarizeCaregiverNotes } from './summarizer.js';
import type { ExtractionResult } from '@ara/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const upload = multer({ 
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { 
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  logger.debug('Health check requested');
  const ollamaStatus = await checkOllamaHealth();
  const models = ollamaStatus ? await listModels() : [];
  res.json({
    status: 'ok',
    ollama: ollamaStatus ? 'connected' : 'disconnected',
    models: models.slice(0, 5),
  });
});

// OCR endpoint for PDFs and images
app.post('/extract/pdf', upload.single('file'), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
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

    // Parse form data
    progress.update(55, 'Parsing form data');
    const parseResult = await parseFormFromText(
      ocrResult.text, 
      ocrResult.confidence,
      useVision ? filePath : undefined
    );
    
    progress.update(95, 'Finalizing results');
    logger.info('Parsing complete', {
      requestId,
      method: parseResult.extractionMethod,
      ollamaAvailable: parseResult.ollamaAvailable,
      fieldsExtracted: Object.keys(parseResult.form).length
    });

    const result: ExtractionResult = {
      form: parseResult.form,
      confidence: parseResult.confidence,
      rawText: ocrResult.text,
      extractionMethod: parseResult.extractionMethod,
      ollamaAvailable: parseResult.ollamaAvailable,
    };

    // Clean up uploaded file
    await fs.unlink(filePath).catch(() => {});
    
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
      await fs.unlink(req.file.path).catch(() => {});
    }
    
    res.status(500).json({ 
      error: 'Extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Summarize endpoint - generate human-readable summary of OCR text
app.post('/summarize', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    logger.info('Generating summary', { requestId, textLength: text.length });
    
    const summary = await summarizeCaregiverNotes(text);
    
    logger.info('Summary complete', { requestId });
    res.json(summary);
  } catch (error) {
    logger.error('Summary error', { requestId, error });
    res.status(500).json({ 
      error: 'Summary generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Extract and fill endpoint - takes raw OCR text and fills form with LLM
app.post('/extract/fill', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const progress = createProgressTracker('FILL');
  
  try {
    const { rawText, ocrConfidence = 50 } = req.body;
    
    if (!rawText) {
      return res.status(400).json({ error: 'No raw text provided' });
    }

    logger.info('Filling form from OCR text', { requestId, textLength: rawText.length });
    progress.start('Starting AI form filling');
    
    // Check if Ollama is available
    const ollamaAvailable = await checkOllamaHealth();
    
    if (!ollamaAvailable) {
      logger.warn('Ollama not available for form filling', { requestId });
      return res.status(503).json({ 
        error: 'AI filling not available',
        message: 'Ollama is not running. Please start Ollama or use manual fill.'
      });
    }
    
    progress.update(20, 'AI is analyzing the notes');
    
    // Force use of LLM categorizer for filling - pass low confidence to trigger LLM
    // The LLM will categorize and extract all relevant information
    const parseResult = await parseFormFromText(rawText, 40); // 40 triggers LLM categorization
    
    progress.update(80, 'Form fields populated');
    
    // Log what was extracted
    logger.info('Form filling complete', { 
      requestId, 
      method: parseResult.extractionMethod,
      headerFields: Object.values(parseResult.form.header).filter(v => v).length,
      narrativeFields: Object.values(parseResult.form.narrative).filter(v => v).length
    });
    
    progress.complete('Form ready');

    const result: ExtractionResult = {
      form: parseResult.form,
      confidence: parseResult.confidence,
      rawText: rawText,
      extractionMethod: parseResult.extractionMethod,
      ollamaAvailable: parseResult.ollamaAvailable,
    };

    res.json(result);
  } catch (error) {
    progress.error(error instanceof Error ? error.message : 'Unknown error');
    logger.error('Form filling error', { requestId, error });
    res.status(500).json({ 
      error: 'Form filling failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Export endpoint - fill PDF template
app.post('/export/pdf', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const { form, templateVersion = 'mccmc_v2' } = req.body;
    
    if (!form) {
      logger.warn('Export request without form data', { requestId });
      return res.status(400).json({ error: 'No form data provided' });
    }

    logger.info('Starting PDF export', { 
      requestId, 
      template: templateVersion,
      recipient: form.header?.recipientName || 'unknown'
    });

    // Generate filled PDF
    const pdfBuffer = await fillPDFForm(form, templateVersion);
    
    logger.info('PDF export complete', { 
      requestId, 
      size: `${(pdfBuffer.length / 1024).toFixed(2)}KB` 
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="care-coordination-form.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Export error', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown' 
    });
    res.status(500).json({ 
      error: 'Export failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get template mapping
app.get('/template/:version/mapping', async (req, res) => {
  try {
    const { version } = req.params;
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

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log('');
  console.log('+----------------------------------------------------+');
  console.log('|   ARA Local AI Service                             |');
  console.log(`|   Port: ${PORT}                                    |`);
  console.log('+----------------------------------------------------+');
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health          - Health check');
  console.log('  POST /extract/pdf     - Extract OCR from PDF/image');
  console.log('  POST /summarize       - Generate AI summary of notes');
  console.log('  POST /extract/fill    - Fill form using AI');
  console.log('  POST /export/pdf      - Generate filled PDF');
  console.log('  GET  /template/:v/map - Get template mapping');
  console.log('');
  console.log('Environment:');
  console.log(`  LOG_LEVEL: ${process.env.LOG_LEVEL || 'info'}`);
  console.log(`  OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || 'qwen2.5:0.5b'}`);
  console.log('');
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
