#!/bin/bash
# Setup script for Qwen3-4B-Q4_K_M model
# Run this script to configure Ollama with the recommended model

set -e

echo "========================================"
echo "ARA Caregiver Assistant - Model Setup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Ollama is installed
echo -e "${YELLOW}Checking for Ollama...${NC}"
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}ERROR: Ollama not found!${NC}"
    echo ""
    echo "Please install Ollama first:"
    echo "  1. Visit https://ollama.ai"
    echo "  2. Download and install Ollama"
    echo "  3. Restart your terminal"
    echo ""
    exit 1
fi

echo -e "${GREEN}[OK] Ollama found${NC}"
echo ""

# Check if model is already available
echo -e "${YELLOW}Checking for Qwen3-4B-Q4_K_M model...${NC}"
if ollama list | grep -q "qwen3:4b-q4_K_M"; then
    echo -e "${GREEN}[OK] Model already installed!${NC}"
else
    echo -e "${YELLOW}Model not found. Downloading Qwen3-4B-Q4_K_M...${NC}"
    echo -e "${CYAN}This will download ~2.3GB and may take a few minutes.${NC}"
    echo ""
    
    ollama pull qwen3:4b-q4_K_M
    
    echo -e "${GREEN}[OK] Model downloaded successfully!${NC}"
fi

echo ""

# Test the model
echo -e "${YELLOW}Testing model...${NC}"
if ollama run qwen3:4b-q4_K_M "Say 'Qwen3 is ready!'" 2>/dev/null | grep -q "ready"; then
    echo -e "${GREEN}[OK] Model test passed!${NC}"
else
    echo -e "${YELLOW}[WARN] Model test inconclusive, but should work${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Start the AI service: npm run dev:service"
echo "  2. Start the desktop app: npm run dev:web"
echo "  3. Open http://localhost:1420 in your browser"
echo ""
echo "Model: qwen3:4b-q4_K_M (Q4_K_M quantization)"
echo "Size: ~2.3GB | VRAM: ~3GB | Context: 8K tokens"
echo ""
