#!/usr/bin/env node
/**
 * ARA Caregiver Assistant - Cross-Platform Setup
 * Detects OS and runs the appropriate setup script
 */

import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const os = platform();

console.log('');
console.log('========================================');
console.log('  ARA Caregiver Assistant - Setup');
console.log('========================================');
console.log('');
console.log(`Detected OS: ${os}`);
console.log('');

function runScript(scriptPath, shell) {
  console.log(`Running setup script: ${scriptPath}`);
  console.log('');

  try {
    if (os === 'win32') {
      // Windows: Use PowerShell
      const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        stdio: 'inherit',
        cwd: rootDir,
      });

      child.on('close', code => {
        process.exit(code);
      });
    } else {
      // macOS/Linux: Use bash
      const child = spawn('bash', [scriptPath], {
        stdio: 'inherit',
        cwd: rootDir,
      });

      child.on('close', code => {
        process.exit(code);
      });
    }
  } catch (error) {
    console.error(`Failed to run setup script: ${error.message}`);
    process.exit(1);
  }
}

// Determine which script to run
let scriptPath;
if (os === 'win32') {
  scriptPath = join(rootDir, 'scripts', 'setup.ps1');
} else {
  scriptPath = join(rootDir, 'scripts', 'setup.sh');
}

// Check if script exists
try {
  execSync(`test -f "${scriptPath}"`, { shell: true });
} catch {
  console.error(`Setup script not found: ${scriptPath}`);
  console.log('');
  console.log('Please run the setup manually:');

  if (os === 'win32') {
    console.log('  PowerShell: .\\scripts\\setup.ps1');
    console.log('  Or: npm run setup:win');
  } else {
    console.log('  Bash: ./scripts/setup.sh');
    console.log('  Or: npm run setup:linux');
    console.log('  Or: npm run setup:mac');
  }

  process.exit(1);
}

runScript(scriptPath);
