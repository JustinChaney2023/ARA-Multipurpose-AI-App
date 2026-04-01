# =============================================================================
# ARA Caregiver Assistant - Makefile (Linux/macOS)
# =============================================================================

.PHONY: help setup install dev dev-service dev-web build test clean docker-up docker-down

# Default target
help:
	@echo "ARA Caregiver Assistant - Available Commands"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make setup          - Run full setup (install dependencies, build, etc.)"
	@echo "  make install        - Install npm dependencies"
	@echo "  make build-shared   - Build the shared package"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev            - Start both service and web app (requires tmux or new terminals)"
	@echo "  make dev-service    - Start AI service (http://localhost:3001)"
	@echo "  make dev-web        - Start web app (http://localhost:1420)"
	@echo "  make dev-desktop    - Start desktop app (requires Rust)"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build          - Build all packages"
	@echo "  make build-desktop  - Build desktop app for production"
	@echo ""
	@echo "Testing Commands:"
	@echo "  make test           - Run all tests"
	@echo "  make test-watch     - Run tests in watch mode"
	@echo "  make verify         - Run verification (typecheck + tests)"
	@echo "  make lint           - Run linter"
	@echo "  make lint-fix       - Fix linting issues"
	@echo "  make format         - Format code with Prettier"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-up      - Start services with Docker"
	@echo "  make docker-down    - Stop Docker services"
	@echo "  make docker-logs    - View Docker logs"
	@echo "  make docker-build   - Build Docker images"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make clean          - Clean build artifacts and node_modules"
	@echo "  make clean-build    - Clean only build artifacts"
	@echo "  make setup-ollama   - Setup Ollama with recommended model"
	@echo ""

# Setup Commands
# =============================================================================

setup:
	@echo "Running full setup..."
	@bash scripts/setup.sh

install:
	@echo "Installing dependencies..."
	npm install

build-shared:
	@echo "Building shared package..."
	npm run -w packages/shared build

# Development Commands
# =============================================================================

dev-service:
	@echo "Starting AI service on http://localhost:3001"
	npm run dev:service

dev-web:
	@echo "Starting web app on http://localhost:1420"
	npm run dev:web

dev-desktop:
	@echo "Starting desktop app..."
	npm run dev:desktop

# Combined development (runs service in background)
dev:
	@echo "Starting development environment..."
	@echo "This will start the AI service and web app."
	@echo "Press Ctrl+C to stop both."
	@echo ""
	@(trap 'kill %1' INT; npm run dev:service & npm run dev:web)

# Build Commands
# =============================================================================

build:
	@echo "Building all packages..."
	npm run build

build-desktop:
	@echo "Building desktop app..."
	npm run build:desktop

# Testing Commands
# =============================================================================

test:
	@echo "Running tests..."
	npm test

test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

verify:
	@echo "Running verification..."
	npm run verify

lint:
	@echo "Running linter..."
	npm run lint

lint-fix:
	@echo "Fixing linting issues..."
	npm run lint:fix

format:
	@echo "Formatting code..."
	npm run format

format-check:
	@echo "Checking code formatting..."
	npm run format:check

# Docker Commands
# =============================================================================

docker-up:
	@echo "Starting Docker services..."
	docker-compose up -d

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

docker-logs:
	@echo "Viewing Docker logs..."
	docker-compose logs -f local-ai

docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-clean:
	@echo "Removing Docker containers and volumes..."
	docker-compose down -v

# Utility Commands
# =============================================================================

clean: clean-build
	@echo "Removing node_modules..."
	rm -rf node_modules
	rm -rf apps/desktop/node_modules
	rm -rf apps/desktop/src-tauri/target
	rm -rf services/local-ai/node_modules
	rm -rf packages/shared/node_modules

clean-build:
	@echo "Cleaning build artifacts..."
	rm -rf dist
	rm -rf build
	rm -rf packages/shared/dist
	rm -rf services/local-ai/dist
	rm -rf apps/desktop/dist
	find . -name "*.tsbuildinfo" -delete
	find . -name ".cache" -type d -exec rm -rf {} + 2>/dev/null || true

setup-ollama:
	@echo "Setting up Ollama with recommended model..."
	@bash scripts/setup-qwen3.sh

# Quick health check
health:
	@echo "Checking service health..."
	@curl -s http://localhost:3001/health | jq . || curl -s http://localhost:3001/health
