#!/usr/bin/env node
/**
 * Clean script - removes node_modules and build artifacts
 * Cross-platform support for Windows, macOS, and Linux
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';

const dirsToRemove = [
  'node_modules',
  'apps/desktop/node_modules',
  'services/local-ai/node_modules',
  'packages/shared/node_modules',
  'apps/desktop/src-tauri/target',
  'dist',
  'build',
  'packages/shared/dist',
  'services/local-ai/dist',
];

console.log('Cleaning project...\n');

for (const dir of dirsToRemove) {
  const fullPath = path.join(__dirname, '..', dir);
  
  if (fs.existsSync(fullPath)) {
    try {
      if (isWindows) {
        // Windows: use rd /s /q for directories, del for files
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          execSync(`rd /s /q "${fullPath}"`, { stdio: 'ignore' });
        } else {
          execSync(`del /f /q "${fullPath}"`, { stdio: 'ignore' });
        }
      } else {
        // Unix: use rm -rf
        execSync(`rm -rf "${fullPath}"`, { stdio: 'ignore' });
      }
      console.log(`✓ Removed ${dir}`);
    } catch (err) {
      console.log(`✗ Failed to remove ${dir}: ${err.message}`);
    }
  }
}

console.log('\nClean complete!');
