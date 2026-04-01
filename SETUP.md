# ARA Caregiver Assistant - Complete Setup Guide

This guide will walk you through setting up the ARA Caregiver Assistant on any platform (Windows, macOS, or Linux).

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Platform-Specific Setup](#platform-specific-setup)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Docker Setup](#docker-setup)
- [Ollama Setup (Optional)](#ollama-setup-optional)
- [Running the Application](#running-the-application)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

## Quick Start

The fastest way to get started is using our automated setup scripts:

```bash
# Clone the repository
git clone <your-repo-url>
cd ara-caregiver-assistant

# Run the automated setup
npm run setup
```

The setup script will:
1. Check for Node.js (>= 18.0.0)
2. Install npm dependencies
3. Build the shared package
4. Set up environment configuration
5. Check for optional Ollama installation

## Prerequisites

### Required

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | >= 18.0.0 | JavaScript runtime |
| **npm** | >= 9.0.0 | Package manager |

### Optional

| Software | Version | Purpose |
|----------|---------|---------|
| **Rust** | >= 1.70.0 | Build desktop app (Tauri) |
| **Ollama** | latest | AI-enhanced text extraction |
| **Docker** | >= 20.0.0 | Containerized deployment |

### Checking Prerequisites

**Windows (PowerShell):**
```powershell
node --version    # Should be v18.x.x or higher
npm --version     # Should be 9.x.x or higher
cargo --version   # Optional - for desktop app
ollama --version  # Optional - for AI features
```

**macOS/Linux:**
```bash
node --version    # Should be v18.x.x or higher
npm --version     # Should be 9.x.x or higher
cargo --version   # Optional - for desktop app
ollama --version  # Optional - for AI features
```

## Platform-Specific Setup

### Windows

#### 1. Install Node.js

**Option A: Using winget (recommended)**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Option B: Download from website**
- Visit https://nodejs.org/
- Download the LTS version (v20 or higher)
- Run the installer

**Option C: Using Chocolatey**
```powershell
choco install nodejs-lts
```

#### 2. Install Git (if not already installed)
```powershell
winget install Git.Git
```

#### 3. Clone and Setup

```powershell
# Clone the repository
git clone <your-repo-url>
cd ara-caregiver-assistant

# Run automated setup
npm run setup
# Or directly with PowerShell:
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

#### 4. (Optional) Install Rust for Desktop App

```powershell
# Using rustup (recommended)
irm https://win.rustup.rs | iex

# Or using winget
winget install Rustlang.Rustup
```

### macOS

#### 1. Install Node.js

**Option A: Using Homebrew (recommended)**
```bash
brew install node@20
```

**Option B: Download from website**
- Visit https://nodejs.org/
- Download the macOS LTS installer

#### 2. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd ara-caregiver-assistant

# Run automated setup
npm run setup
# Or:
bash scripts/setup.sh
```

#### 3. (Optional) Install Rust for Desktop App

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Linux

#### 1. Install Node.js

**Ubuntu/Debian:**
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

**CentOS/RHEL/Fedora:**
```bash
# Using NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Or on Fedora
sudo dnf install -y nodejs
```

**Arch Linux:**
```bash
sudo pacman -S nodejs npm
```

#### 2. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd ara-caregiver-assistant

# Run automated setup
npm run setup
# Or:
bash scripts/setup.sh
```

#### 3. (Optional) Install Rust for Desktop App

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

#### 4. (Optional) Install System Dependencies for OCR

On some Linux distributions, you may need additional system packages for OCR:

**Ubuntu/Debian:**
```bash
sudo apt-get install -y tesseract-ocr libtesseract-dev
```

**CentOS/RHEL/Fedora:**
```bash
sudo yum install -y tesseract tesseract-devel
# Or on Fedora
sudo dnf install -y tesseract tesseract-devel
```

## Docker Setup

Docker provides a consistent environment across all platforms without needing to install Node.js or Ollama locally.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

### Quick Start with Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f local-ai

# Stop services
docker-compose down
```

The application will be available at:
- AI Service: http://localhost:3001
- Web App: Not included in Docker by default (run locally with `npm run dev:web`)

### Docker Commands

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f local-ai

# Restart service
docker-compose restart local-ai

# Clean up everything (including volumes)
docker-compose down -v
```

## Ollama Setup (Optional)

Ollama provides AI-enhanced text extraction. The app works without it using OCR-only mode.

### Install Ollama

**Windows:**
```powershell
# Using winget
winget install Ollama.Ollama

# Or download from https://ollama.ai/download/windows
```

**macOS:**
```bash
# Using Homebrew
brew install ollama

# Or download from https://ollama.ai/download/mac
```

**Linux:**
```bash
# Automated install
curl -fsSL https://ollama.com/install.sh | sh
```

### Setup Recommended Model

**Automated (all platforms):**
```bash
npm run setup:ollama
```

**Manual:**
```bash
# Pull the recommended model (~2.3GB)
ollama pull qwen3:4b-q4_K_M

# Or use a smaller/faster model
ollama pull qwen2.5:0.5b
```

### Verify Ollama

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Or using the app
npm run verify
```

### Model Options

| Model | Size | VRAM | Speed | Quality |
|-------|------|------|-------|---------|
| `qwen2.5:0.5b` | ~300MB | ~1GB | ⚡⚡⚡⚡⚡ | ⭐⭐ |
| `qwen3:4b-q4_K_M` | ~2.3GB | ~3GB | ⚡⚡⚡ | ⭐⭐⭐⭐ |
| `qwen3:4b-q8_0` | ~3.5GB | ~4GB | ⚡⚡ | ⭐⭐⭐⭐⭐ |
| `llama3.2:3b` | ~2GB | ~3GB | ⚡⚡⚡ | ⭐⭐⭐ |

## Running the Application

### Development Mode (Web)

**Terminal 1 - Start AI Service:**
```bash
npm run dev:service
```

**Terminal 2 - Start Web App:**
```bash
npm run dev:web
```

Open http://localhost:1420 in your browser.

### Development Mode (Desktop)

Requires Rust to be installed.

```bash
npm run dev:desktop
```

### Using Make (Linux/macOS)

If you have `make` installed:

```bash
# Full setup
make setup

# Start service only
make dev-service

# Start web app only
make dev-web

# Run tests
make test

# Build desktop app
make build-desktop
```

## Troubleshooting

### Port 3001 Already in Use

**Windows:**
```powershell
# Find the process
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess

# Stop it
Stop-Process -Id <PID>
```

**macOS/Linux:**
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9
# Or
fuser -k 3001/tcp
```

### Node.js Version Issues

**Windows:**
```powershell
# Using nvm-windows
nvm install 20
nvm use 20
```

**macOS/Linux:**
```bash
# Using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### Ollama Timeouts

The app automatically disables LLM after the first timeout and uses OCR-only mode. To manually disable:

```bash
# In your .env file or terminal
DISABLE_LLM=true
```

### Permission Errors (Linux/macOS)

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Build Errors

Clean and rebuild:

```bash
# Clean everything
npm run clean

# Or manually
rm -rf node_modules packages/shared/dist services/local-ai/dist

# Reinstall
npm install
npm run -w packages/shared build
```

### Docker Issues

```bash
# Reset Docker environment
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Next Steps

After successful setup:

1. **Read the Quick Start:** See [QUICKSTART.md](QUICKSTART.md) for usage instructions
2. **Explore Documentation:** Check the `docs/` folder for detailed guides
3. **Run Tests:** Verify everything works with `npm test`
4. **Try the App:** 
   - Import a PDF or image of caregiver notes
   - Review and edit extracted fields
   - Export as PDF

## Support

If you encounter issues:

1. Check [docs/ollama-troubleshooting.md](docs/ollama-troubleshooting.md) for Ollama issues
2. Review [docs/development.md](docs/development.md) for development details
3. Run `npm run verify` to check your setup
