import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import { config } from './config/index.js';
import { logger } from './logger.js';

export interface HandwritingOCRResult {
  text: string;
  confidence: number;
  engine: 'paddleocr';
}

interface PaddleLine {
  text: string;
  confidence?: number;
}

interface PaddleResponse {
  lines?: PaddleLine[];
  error?: string;
}

function getServiceRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join('services', 'local-ai'))) {
    return cwd;
  }

  return path.join(cwd, 'services', 'local-ai');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parsePaddleResponse(stdout: string): PaddleResponse {
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const jsonLine = lines.at(-1);

  if (!jsonLine) {
    return { error: 'PaddleOCR returned no output' };
  }

  try {
    return JSON.parse(jsonLine) as PaddleResponse;
  } catch (error) {
    return {
      error: `PaddleOCR returned invalid JSON: ${
        error instanceof Error ? error.message : 'Unknown parse error'
      }`,
    };
  }
}

export async function runHandwritingOCR(imagePath: string): Promise<HandwritingOCRResult | null> {
  if (!config.ocr.handwriting.enabled) {
    return null;
  }

  const scriptPath = path.join(getServiceRoot(), 'scripts', 'paddle_handwriting_ocr.py');
  if (!(await fileExists(scriptPath))) {
    logger.warn('PaddleOCR bridge script not found', { scriptPath });
    return null;
  }

  const timeoutMs = config.ocr.handwriting.timeoutMs;
  const pythonCommand = config.ocr.handwriting.pythonCommand;

  const response = await new Promise<PaddleResponse>((resolve, reject) => {
    const child = spawn(pythonCommand, [scriptPath, imagePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PADDLEOCR_DEVICE: config.ocr.handwriting.device,
        PADDLEOCR_MODEL: config.ocr.handwriting.model,
      },
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`PaddleOCR timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PaddleOCR exited with code ${code ?? 'unknown'}`));
        return;
      }

      resolve(parsePaddleResponse(stdout));
    });
  });

  if (response.error) {
    throw new Error(response.error);
  }

  const lines = response.lines?.filter(line => line.text.trim()) ?? [];
  if (lines.length === 0) {
    return {
      text: '',
      confidence: 0,
      engine: 'paddleocr',
    };
  }

  const text = lines.map(line => line.text.trim()).join('\n');
  const scored = lines.filter(line => typeof line.confidence === 'number');
  const confidence =
    scored.length > 0
      ? (scored.reduce((sum, line) => sum + (line.confidence ?? 0), 0) / scored.length) * 100
      : 65;

  return {
    text,
    confidence,
    engine: 'paddleocr',
  };
}
