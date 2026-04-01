#!/usr/bin/env pwsh
# Setup script for Qwen3-4B-Q4_K_M model
# Run this script to configure Ollama with the recommended model

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ARA Caregiver Assistant - Model Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Ollama is installed
Write-Host "Checking for Ollama..." -ForegroundColor Yellow
$ollama = Get-Command ollama -ErrorAction SilentlyContinue

if (-not $ollama) {
    Write-Host "ERROR: Ollama not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Ollama first:"
    Write-Host "  1. Visit https://ollama.ai"
    Write-Host "  2. Download and install Ollama"
    Write-Host "  3. Restart your terminal"
    Write-Host ""
    exit 1
}

Write-Host "✓ Ollama found at: $($ollama.Source)" -ForegroundColor Green
Write-Host ""

# Check if model is already available
Write-Host "Checking for Qwen3-4B-Q4_K_M model..." -ForegroundColor Yellow
$models = ollama list 2>$null
$hasModel = $models | Select-String "qwen3:4b-q4_K_M"

if ($hasModel) {
    Write-Host "✓ Model already installed!" -ForegroundColor Green
} else {
    Write-Host "Model not found. Downloading Qwen3-4B-Q4_K_M..." -ForegroundColor Yellow
    Write-Host "This will download ~2.3GB and may take a few minutes." -ForegroundColor Gray
    Write-Host ""
    
    ollama pull qwen3:4b-q4_K_M
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to download model!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✓ Model downloaded successfully!" -ForegroundColor Green
}

Write-Host ""

# Test the model
Write-Host "Testing model..." -ForegroundColor Yellow
$testResult = ollama run qwen3:4b-q4_K_M "Say 'Qwen3 is ready!'" 2>$null

if ($testResult -match "ready") {
    Write-Host "✓ Model test passed!" -ForegroundColor Green
} else {
    Write-Host "⚠ Model test inconclusive, but should work" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start the AI service: npm run dev:service"
Write-Host "  2. Start the desktop app: npm run dev:web"
Write-Host "  3. Open http://localhost:1420 in your browser"
Write-Host ""
Write-Host "Model: qwen3:4b-q4_K_M (Q4_K_M quantization)"
Write-Host "Size: ~2.3GB | VRAM: ~3GB | Context: 8K tokens"
Write-Host ""
