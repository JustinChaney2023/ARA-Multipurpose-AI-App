import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { fromPath } from 'pdf2pic';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { logger, createProgressTracker } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local path to tesseract trained data - ensures offline operation
// The eng.traineddata file should be in services/local-ai/ directory
const TESSERACT_LANG_PATH = path.join(__dirname, '..');

export interface OCROutput {
  text: string;
  confidence: number;
  pageCount: number;
  method: 'pdf-text' | 'pdf-ocr' | 'image-ocr';
}

/**
 * Extract text from a file (PDF or image)
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string
): Promise<OCROutput> {
  const progress = createProgressTracker('OCR');
  
  if (mimeType === 'application/pdf') {
    return extractFromPDF(filePath, progress);
  }

  if (mimeType.startsWith('image/')) {
    return extractFromImage(filePath, progress);
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Extract text from PDF
 */
async function extractFromPDF(filePath: string, progress: ReturnType<typeof createProgressTracker>): Promise<OCROutput> {
  progress.start('Starting PDF extraction');
  
  // Try text extraction first
  progress.update(10, 'Reading PDF file');
  const buffer = await fs.readFile(filePath);
  
  progress.update(30, 'Parsing PDF structure');
  const pdfData = await pdfParse(buffer);
  
  progress.update(50, `Found ${pdfData.numpages} pages, checking for text content`);
  
  // If we got substantial text, use it
  if (pdfData.text.trim().length > 100) {
    progress.complete(`Extracted ${pdfData.text.length} chars via text layer`);
    logger.info('PDF extraction complete (text layer)', { 
      pages: pdfData.numpages, 
      chars: pdfData.text.length,
      method: 'pdf-text'
    });
    
    return {
      text: pdfData.text,
      confidence: 95,
      pageCount: pdfData.numpages,
      method: 'pdf-text',
    };
  }

  // Fall back to OCR
  progress.update(60, 'Text layer empty, converting to images for OCR');
  return extractFromPDFWithOCR(filePath, pdfData.numpages, progress);
}

/**
 * Convert PDF pages to images and OCR them
 */
async function extractFromPDFWithOCR(
  filePath: string, 
  pageCount: number,
  progress: ReturnType<typeof createProgressTracker>
): Promise<OCROutput> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ara-ocr-'));
  logger.debug('Created temp directory', { path: tempDir });
  
  try {
    progress.update(20, 'Converting PDF pages to images');
    
    const convert = fromPath(filePath, {
      density: 300,
      saveFilename: 'page',
      savePath: tempDir,
      format: 'png',
      width: 2480,
      height: 3508,
    });

    const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);
    const images = await convert.bulk(pageNumbers);
    
    logger.info(`Converted ${images.length} pages to images`);
    progress.update(40, `Converted ${images.length} pages, starting OCR`);
    
    // Use local trained data - no network calls
    const worker = await createWorker('eng', undefined, {
      langPath: TESSERACT_LANG_PATH,
      logger: m => logger.debug('Tesseract', m)
    });
    const results: { text: string; confidence: number }[] = [];
    
    try {
      for (let i = 0; i < images.length; i++) {
        const percent = 40 + Math.floor((i / images.length) * 50);
        progress.update(percent, `OCR page ${i + 1} of ${images.length}`);
        
        const image = images[i];
        const imagePath = typeof image === 'string' ? image : image.path;
        
        if (!imagePath) {
          logger.warn(`Invalid image path for page ${i + 1}, skipping`);
          continue;
        }
        
        logger.debug(`Processing page ${i + 1}/${images.length}`);
        const result = await worker.recognize(imagePath);
        results.push({
          text: result.data.text,
          confidence: result.data.confidence,
        });
        
        logger.debug(`Page ${i + 1} OCR confidence: ${result.data.confidence.toFixed(1)}%`);
      }
    } finally {
      await worker.terminate();
    }

    const fullText = results.map(r => r.text).join('\n\n--- Page Break ---\n\n');
    const avgConfidence = results.length > 0 
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length 
      : 0;

    // Clean up
    progress.update(95, 'Cleaning up temporary files');
    for (const image of images) {
      const imagePath = typeof image === 'string' ? image : image.path;
      if (typeof imagePath === 'string') {
        await fs.unlink(imagePath).catch(() => {});
      }
    }

    progress.complete(`OCR complete, avg confidence: ${avgConfidence.toFixed(1)}%`);
    logger.info('PDF OCR complete', { 
      pages: pageCount, 
      confidence: avgConfidence,
      method: 'pdf-ocr'
    });

    return {
      text: fullText,
      confidence: avgConfidence,
      pageCount,
      method: 'pdf-ocr',
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract text from image using tesseract.js
 */
async function extractFromImage(filePath: string, progress: ReturnType<typeof createProgressTracker>): Promise<OCROutput> {
  progress.start('Starting image OCR with tesseract.js');
  
  // Use local trained data - no network calls
  const worker = await createWorker('eng', undefined, {
    langPath: TESSERACT_LANG_PATH,
    logger: m => logger.debug('Tesseract', m)
  });
  
  try {
    progress.update(30, 'Loading image');
    
    progress.update(60, 'Running OCR');
    const result = await worker.recognize(filePath);
    
    progress.update(90, 'Processing results');
    
    progress.complete(`OCR complete, confidence: ${result.data.confidence.toFixed(1)}%`);
    logger.info('Image OCR complete', { 
      confidence: result.data.confidence,
      method: 'image-ocr',
      chars: result.data.text.length
    });
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      pageCount: 1,
      method: 'image-ocr',
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Get page count from PDF
 */
async function getPDFPageCount(filePath: string): Promise<number> {
  const buffer = await fs.readFile(filePath);
  const pdfData = await pdfParse(buffer);
  return pdfData.numpages;
}
