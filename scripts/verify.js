#!/usr/bin/env node
/**
 * Verification script for ARA Caregiver Assistant
 * Runs typecheck and tests across all packages
 */

import { execSync } from 'child_process';
import process from 'process';

const steps = [
  { name: 'Type check shared package', cmd: 'npm run -w packages/shared typecheck' },
  { name: 'Type check local-ai service', cmd: 'npm run -w services/local-ai typecheck' },
  { name: 'Type check desktop app', cmd: 'npm run -w apps/desktop typecheck' },
  { name: 'Test shared package', cmd: 'npm run -w packages/shared test' },
  { name: 'Test local-ai service', cmd: 'npm run -w services/local-ai test' },
];

let hasErrors = false;

console.log('+----------------------------------------------------+');
console.log('|   ARA Caregiver Assistant - Verification           |');
console.log('+----------------------------------------------------+\n');

for (const step of steps) {
  console.log(`-> ${step.name}...`);
  try {
    execSync(step.cmd, { stdio: 'inherit' });
    console.log(`OK ${step.name} passed\n`);
  } catch (error) {
    console.error(`X ${step.name} failed\n`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log('\n== Verification failed ==');
  process.exit(1);
} else {
  console.log('\nOK All checks passed');
  process.exit(0);
}
