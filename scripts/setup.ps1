# =============================================================================
# ARA Caregiver Assistant - Cross-Platform Setup Script (Windows)
# =============================================================================

$ErrorActionPreference = "Stop"

# Colors for PowerShell
function Write-Header($text) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success($text) {
    Write-Host "[OK] $text" -ForegroundColor Green
}

function Write-Warning($text) {
    Write-Host "[WARN] $text" -ForegroundColor Yellow
}

function Write-Error($text) {
    Write-Host "[ERROR] $text" -ForegroundColor Red
}

function Write-Info($text) {
    Write-Host "-> $text" -ForegroundColor Blue
}

function Write-Step($number, $text) {
    Write-Host "Step ${number}: $text" -ForegroundColor White -BackgroundColor DarkGray
}

function Test-Command($command) {
    $null = Get-Command $command -ErrorAction SilentlyContinue
    return $?
}

# =============================================================================
# MAIN SETUP
# =============================================================================

Write-Header "ARA Caregiver Assistant - Setup"
Write-Host "Detected OS: Windows" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Check Node.js
# -----------------------------------------------------------------------------
Write-Step "1" "Checking Node.js installation"

if (Test-Command "node") {
    $nodeVersion = node --version
    $nodeVersionClean = $nodeVersion -replace 'v', ''
    $versionParts = $nodeVersionClean -split '\.'
    $nodeMajor = [int]$versionParts[0]
    $nodeMinor = [int]$versionParts[1]
    
    if ($nodeMajor -gt 20 -or ($nodeMajor -eq 20 -and $nodeMinor -ge 16)) {
        Write-Success "Node.js $nodeVersion found (>= 20.16.0)"
    } else {
        Write-Error "Node.js $nodeVersion found, but >= 20.16.0 is required"
        Write-Info "Please upgrade Node.js: https://nodejs.org/"
        Write-Info "Or run: winget install OpenJS.NodeJS"
        exit 1
    }
} else {
    Write-Error "Node.js not found"
    Write-Info "Please install Node.js 20.16+: https://nodejs.org/"
    Write-Info "Or run: winget install OpenJS.NodeJS"
    exit 1
}

# -----------------------------------------------------------------------------
# Step 2: Check npm
# -----------------------------------------------------------------------------
Write-Step "2" "Checking npm installation"

if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Success "npm $npmVersion found"
} else {
    Write-Error "npm not found"
    Write-Info "Please install npm (comes with Node.js)"
    exit 1
}

# -----------------------------------------------------------------------------
# Step 3: Check Rust (optional but recommended for desktop build)
# -----------------------------------------------------------------------------
Write-Step "3" "Checking Rust installation (optional)"

if (Test-Command "cargo") {
    $rustVersion = (cargo --version) -split ' ' | Select-Object -Index 1
    Write-Success "Rust $rustVersion found"
    Write-Info "You can build the desktop app with: npm run build:desktop"
} else {
    Write-Warning "Rust not found (optional)"
    Write-Info "Install Rust if you want to build the desktop app: https://rustup.rs/"
    Write-Info "Web mode works without Rust"
}

# -----------------------------------------------------------------------------
# Step 4: Install dependencies
# -----------------------------------------------------------------------------
Write-Step "4" "Installing dependencies"

Write-Info "Running npm install..."
npm install
Write-Success "Dependencies installed"

# -----------------------------------------------------------------------------
# Step 5: Build shared package
# -----------------------------------------------------------------------------
Write-Step "5" "Building shared package"

Write-Info "Building @ara/shared..."
npm run -w packages/shared build
Write-Success "Shared package built"

# -----------------------------------------------------------------------------
# Step 6: Setup environment file
# -----------------------------------------------------------------------------
Write-Step "6" "Setting up environment configuration"

if (Test-Path "services/local-ai/.env") {
    Write-Success ".env file already exists"
} else {
    if (Test-Path "services/local-ai/.env.example") {
        Copy-Item "services/local-ai/.env.example" "services/local-ai/.env"
        Write-Success "Created .env from .env.example"
        Write-Info "Edit services/local-ai/.env to customize settings"
    } elseif (Test-Path ".env.example") {
        Copy-Item ".env.example" "services/local-ai/.env"
        Write-Success "Created .env from root .env.example"
        Write-Info "Edit services/local-ai/.env to customize settings"
    } else {
        Write-Warning "No .env.example found, skipping environment setup"
    }
}

# -----------------------------------------------------------------------------
# Step 7: Check Ollama (optional)
# -----------------------------------------------------------------------------
Write-Step "7" "Checking Ollama installation (optional)"

if (Test-Command "ollama") {
    Write-Success "Ollama found"
    
    # Check if Ollama is running
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
        Write-Success "Ollama server is running"
        
        # Check for recommended model
        $hasQwen3 = $response.models | Where-Object { $_.name -like "*qwen3*" }
        if ($hasQwen3) {
            Write-Success "Qwen3 model found"
        } else {
            Write-Warning "Qwen3 model not found"
            Write-Info "Pull the recommended model with: ollama pull qwen3:4b-q4_K_M"
            Write-Info "Or run: .\scripts\setup-qwen3.ps1"
        }
    } catch {
        Write-Warning "Ollama is installed but not running"
        Write-Info "Start Ollama by launching it from the Start Menu or system tray"
    }
} else {
    Write-Warning "Ollama not found (optional)"
    Write-Info "The app works without Ollama using OCR-only mode"
    Write-Info "To enable AI features, install Ollama: https://ollama.ai/download/windows"
    Write-Info "Or run: winget install Ollama.Ollama"
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Header "Setup Complete!"

Write-Host "ARA Caregiver Assistant is ready to use!" -ForegroundColor Green
Write-Host ""
Write-Host "Quick Start:" -ForegroundColor White -BackgroundColor DarkGray
Write-Host ""
Write-Host "  1. Start the AI service:"
Write-Host "     npm run dev:service" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. In a new terminal, start the web app:"
Write-Host "     npm run dev:web" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Open your browser to:"
Write-Host "     http://localhost:1420" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor White -BackgroundColor DarkGray
Write-Host ""
Write-Host "  - Run tests:         npm test"
Write-Host "  - Verify setup:      npm run verify"
Write-Host "  - Build desktop:     npm run build:desktop"
Write-Host "  - Docker setup:      docker-compose up -d"
Write-Host ""
Write-Host "Documentation:" -ForegroundColor White -BackgroundColor DarkGray
Write-Host ""
Write-Host "  - Quick start:       QUICKSTART.md"
Write-Host "  - Full guide:        docs/development.md"
Write-Host "  - Ollama setup:      docs/ollama-setup.md"
Write-Host ""
Write-Host "Note: If Ollama times out, the app automatically uses OCR-only mode." -ForegroundColor Yellow
Write-Host "      To disable LLM entirely, set DISABLE_LLM=true in your .env file" -ForegroundColor Yellow
Write-Host ""

Read-Host -Prompt "Press Enter to exit"
