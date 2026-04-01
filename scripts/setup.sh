#!/bin/bash
# =============================================================================
# ARA Caregiver Assistant - Cross-Platform Setup Script (Linux/macOS)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}→ $1${NC}"
}

print_step() {
    echo -e "${BOLD}Step $1: $2${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get OS info
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)

# =============================================================================
# MAIN SETUP
# =============================================================================

print_header "ARA Caregiver Assistant - Setup"
echo -e "Detected OS: ${CYAN}${OS}${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Check Node.js
# -----------------------------------------------------------------------------
print_step "1" "Checking Node.js installation"

if command_exists node; then
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
    
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js ${NODE_VERSION} found (>= 18.0.0)"
    else
        print_error "Node.js ${NODE_VERSION} found, but >= 18.0.0 is required"
        print_info "Please upgrade Node.js: https://nodejs.org/"
        exit 1
    fi
else
    print_error "Node.js not found"
    print_info "Please install Node.js 18+: https://nodejs.org/"
    
    if [ "$OS" == "macos" ]; then
        print_info "Or run: brew install node@20"
    elif [ "$OS" == "linux" ]; then
        print_info "Or run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    fi
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: Check npm
# -----------------------------------------------------------------------------
print_step "2" "Checking npm installation"

if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_success "npm ${NPM_VERSION} found"
else
    print_error "npm not found"
    print_info "Please install npm (comes with Node.js)"
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 3: Check Rust (optional but recommended for desktop build)
# -----------------------------------------------------------------------------
print_step "3" "Checking Rust installation (optional)"

if command_exists cargo; then
    RUST_VERSION=$(cargo --version | awk '{print $2}')
    print_success "Rust ${RUST_VERSION} found"
    print_info "You can build the desktop app with: npm run build:desktop"
else
    print_warning "Rust not found (optional)"
    print_info "Install Rust if you want to build the desktop app: https://rustup.rs/"
    print_info "Web mode works without Rust"
fi

# -----------------------------------------------------------------------------
# Step 4: Install dependencies
# -----------------------------------------------------------------------------
print_step "4" "Installing dependencies"

print_info "Running npm install..."
npm install
print_success "Dependencies installed"

# -----------------------------------------------------------------------------
# Step 5: Build shared package
# -----------------------------------------------------------------------------
print_step "5" "Building shared package"

print_info "Building @ara/shared..."
npm run -w packages/shared build
print_success "Shared package built"

# -----------------------------------------------------------------------------
# Step 6: Setup environment file
# -----------------------------------------------------------------------------
print_step "6" "Setting up environment configuration"

if [ -f "services/local-ai/.env" ]; then
    print_success ".env file already exists"
else
    if [ -f "services/local-ai/.env.example" ]; then
        cp services/local-ai/.env.example services/local-ai/.env
        print_success "Created .env from .env.example"
        print_info "Edit services/local-ai/.env to customize settings"
    elif [ -f ".env.example" ]; then
        cp .env.example services/local-ai/.env
        print_success "Created .env from root .env.example"
        print_info "Edit services/local-ai/.env to customize settings"
    else
        print_warning "No .env.example found, skipping environment setup"
    fi
fi

# -----------------------------------------------------------------------------
# Step 7: Check Ollama (optional)
# -----------------------------------------------------------------------------
print_step "7" "Checking Ollama installation (optional)"

if command_exists ollama; then
    print_success "Ollama found"
    
    # Check if Ollama is running
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        print_success "Ollama server is running"
        
        # Check for recommended model
        if curl -s http://localhost:11434/api/tags | grep -q "qwen3"; then
            print_success "Qwen3 model found"
        else
            print_warning "Qwen3 model not found"
            print_info "Pull the recommended model with: ollama pull qwen3:4b-q4_K_M"
            print_info "Or run: ./scripts/setup-qwen3.sh"
        fi
    else
        print_warning "Ollama is installed but not running"
        print_info "Start Ollama with: ollama serve"
        
        if [ "$OS" == "macos" ]; then
            print_info "Or launch Ollama from Applications folder"
        fi
    fi
else
    print_warning "Ollama not found (optional)"
    print_info "The app works without Ollama using OCR-only mode"
    print_info "To enable AI features, install Ollama: https://ollama.ai"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
print_header "Setup Complete!"

echo -e "${GREEN}ARA Caregiver Assistant is ready to use!${NC}"
echo ""
echo -e "${BOLD}Quick Start:${NC}"
echo ""
echo "  1. Start the AI service:"
echo -e "     ${CYAN}npm run dev:service${NC}"
echo ""
echo "  2. In a new terminal, start the web app:"
echo -e "     ${CYAN}npm run dev:web${NC}"
echo ""
echo "  3. Open your browser to:"
echo -e "     ${CYAN}http://localhost:1420${NC}"
echo ""
echo -e "${BOLD}Useful Commands:${NC}"
echo ""
echo "  - Run tests:         npm test"
echo "  - Verify setup:      npm run verify"
echo "  - Build desktop:     npm run build:desktop"
echo "  - Docker setup:      docker-compose up -d"
echo ""
echo -e "${BOLD}Documentation:${NC}"
echo ""
echo "  - Quick start:       QUICKSTART.md"
echo "  - Full guide:        docs/development.md"
echo "  - Ollama setup:      docs/ollama-setup.md"
echo ""
echo -e "${YELLOW}Note:${NC} If Ollama times out, the app automatically uses OCR-only mode."
echo -e "      To disable LLM entirely, set ${CYAN}DISABLE_LLM=true${NC} in your .env file"
echo ""
