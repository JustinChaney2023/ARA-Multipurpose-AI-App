import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { PDFParse } from 'pdf-parse';
import { fromPath } from 'pdf2pic';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

import { config } from './config/index.js';
import { runHandwritingOCR } from './handwritingOCR.js';
import { logger, createProgressTracker } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local path to tesseract trained data - ensures offline operation
const TESSERACT_LANG_PATH = config.ocr.tesseractLangPath || path.join(__dirname, '..');

type OCRMethod = 'pdf-text' | 'pdf-ocr' | 'image-ocr' | 'handwriting-ocr' | 'hybrid-ocr';

export interface OCROutput {
  text: string;
  confidence: number;
  pageCount: number;
  method: OCRMethod;
}

interface PageOCRResult {
  text: string;
  confidence: number;
  method: OCRMethod;
}

/**
 * Extract text from a file (PDF or image)
 */
export async function extractTextFromFile(filePath: string, mimeType: string): Promise<OCROutput> {
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
async function extractFromPDF(
  filePath: string,
  progress: ReturnType<typeof createProgressTracker>
): Promise<OCROutput> {
  progress.start('Starting PDF extraction');

  // Try text extraction first
  progress.update(10, 'Reading PDF file');
  const buffer = await fs.readFile(filePath);

  progress.update(30, 'Parsing PDF structure');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const pdfData = await parser.getText();
    const pageCount = pdfData.total;

    progress.update(50, `Found ${pageCount} pages, checking for text content`);

    // If we got substantial text, use it
    if (pdfData.text.trim().length > 100) {
      progress.complete(`Extracted ${pdfData.text.length} chars via text layer`);
      logger.info('PDF extraction complete (text layer)', {
        pages: pageCount,
        chars: pdfData.text.length,
        method: 'pdf-text',
      });

      return {
        text: pdfData.text,
        confidence: 95,
        pageCount,
        method: 'pdf-text',
      };
    }

    // Fall back to OCR
    progress.update(60, 'Text layer empty, converting to images for OCR');
    return extractFromPDFWithOCR(filePath, pageCount, progress);
  } finally {
    await parser.destroy();
  }
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
      density: config.ocr.pdfDensity,
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
      logger: m => logger.debug('Tesseract', m),
    });
    const results: PageOCRResult[] = [];

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
        const result = await runImageOCRPipeline(imagePath, worker);
        results.push(result);

        logger.debug(`Page ${i + 1} OCR confidence: ${result.confidence.toFixed(1)}%`);
      }
    } finally {
      await worker.terminate();
    }

    const fullText = results.map(r => r.text).join('\n\n--- Page Break ---\n\n');
    const avgConfidence = averageConfidence(results);
    const method = selectAggregateMethod(results, 'pdf-ocr');

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
      method,
    });

    return {
      text: fullText,
      confidence: avgConfidence,
      pageCount,
      method,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract text from image using tesseract.js and optional handwriting OCR.
 */
async function extractFromImage(
  filePath: string,
  progress: ReturnType<typeof createProgressTracker>
): Promise<OCROutput> {
  progress.start('Starting image OCR');

  // Use local trained data - no network calls
  const worker = await createWorker('eng', undefined, {
    langPath: TESSERACT_LANG_PATH,
    logger: m => logger.debug('Tesseract', m),
  });

  try {
    progress.update(30, 'Loading image');
    progress.update(60, 'Running OCR');
    const result = await runImageOCRPipeline(filePath, worker);

    progress.update(90, 'Processing results');

    progress.complete(`OCR complete, confidence: ${result.confidence.toFixed(1)}%`);
    logger.info('Image OCR complete', {
      confidence: result.confidence,
      method: result.method,
      chars: result.text.length,
    });

    return {
      text: result.text,
      confidence: result.confidence,
      pageCount: 1,
      method: result.method,
    };
  } finally {
    await worker.terminate();
  }
}

async function runImageOCRPipeline(
  imagePath: string,
  worker: Awaited<ReturnType<typeof createWorker>>
): Promise<PageOCRResult> {
  const prepared = await preprocessImage(imagePath);

  try {
    const tesseractResult = await worker.recognize(prepared.path);
    const baseResult: PageOCRResult = {
      text: tesseractResult.data.text,
      confidence: tesseractResult.data.confidence,
      method: 'image-ocr',
    };

    if (!shouldTryHandwritingOCR(baseResult)) {
      return baseResult;
    }

    try {
      const handwritingResult = await runHandwritingOCR(prepared.path);
      if (!handwritingResult) {
        return baseResult;
      }

      const candidate: PageOCRResult = {
        text: handwritingResult.text,
        confidence: handwritingResult.confidence,
        method: 'handwriting-ocr',
      };

      if (isBetterOCRResult(candidate, baseResult)) {
        logger.info('Using handwriting OCR result over tesseract', {
          tesseractConfidence: baseResult.confidence,
          handwritingConfidence: candidate.confidence,
          tesseractChars: baseResult.text.trim().length,
          handwritingChars: candidate.text.trim().length,
        });
        return candidate;
      }
    } catch (error) {
      logger.warn('Handwriting OCR failed, keeping tesseract result', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return baseResult;
  } finally {
    if (prepared.cleanup) {
      await fs.unlink(prepared.path).catch(() => {});
    }
  }
}

async function preprocessImage(imagePath: string): Promise<{ path: string; cleanup: boolean }> {
  if (!config.ocr.preprocessing.enabled) {
    return { path: imagePath, cleanup: false };
  }

  const outputPath = path.join(
    os.tmpdir(),
    `ara-ocr-preprocessed-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );

  try {
    await sharp(imagePath)
      .rotate()
      .grayscale()
      .normalize()
      .sharpen()
      .threshold(180, { grayscale: false })
      .png()
      .toFile(outputPath);

    return { path: outputPath, cleanup: true };
  } catch (error) {
    logger.warn('Image preprocessing failed, using original image', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { path: imagePath, cleanup: false };
  }
}

function shouldTryHandwritingOCR(result: PageOCRResult): boolean {
  if (!config.ocr.handwriting.enabled) {
    return false;
  }

  return (
    result.confidence < config.ocr.handwriting.confidenceThreshold ||
    result.text.trim().length < config.ocr.handwriting.minTextLength
  );
}

function isBetterOCRResult(candidate: PageOCRResult, current: PageOCRResult): boolean {
  const candidateTextLength = candidate.text.trim().length;
  const currentTextLength = current.text.trim().length;

  if (candidateTextLength < 10) {
    return false;
  }

  if (
    currentTextLength < config.ocr.handwriting.minTextLength &&
    candidateTextLength > currentTextLength
  ) {
    return true;
  }

  return (
    candidate.confidence >= current.confidence && candidateTextLength >= currentTextLength * 0.8
  );
}

function averageConfidence(results: PageOCRResult[]): number {
  return results.length > 0
    ? results.reduce((sum, result) => sum + result.confidence, 0) / results.length
    : 0;
}

function selectAggregateMethod(results: PageOCRResult[], fallback: OCRMethod): OCRMethod {
  if (results.length === 0) {
    return fallback;
  }

  const usedHandwriting = results.some(result => result.method === 'handwriting-ocr');
  const usedTesseract = results.some(result => result.method === 'image-ocr');

  if (usedHandwriting && usedTesseract) {
    return 'hybrid-ocr';
  }

  if (usedHandwriting) {
    return 'handwriting-ocr';
  }

  return fallback;
}
