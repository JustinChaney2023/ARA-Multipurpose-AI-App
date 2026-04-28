# ARA Local AI Service
# Multi-stage build for production

# ============================================================================
# Base stage with common dependencies
# ============================================================================
FROM node:20-alpine AS base

# Install system dependencies for OCR and PDF processing
RUN apk add --no-cache \
    curl \
    cairo-dev \
    pango-dev \
    giflib-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    # Tesseract OCR dependencies
    tesseract-ocr \
    tesseract-ocr-data-eng \
    # Image processing
    imagemagick \
    # PDF processing
    poppler-utils \
    ghostscript

WORKDIR /app

# ============================================================================
# Dependencies stage
# ============================================================================
FROM base AS dependencies

# Copy package files
COPY package*.json .
COPY packages/shared/package.json packages/shared/
COPY services/local-ai/package.json services/local-ai/

# Install all dependencies
RUN npm ci

# ============================================================================
# Build stage
# ============================================================================
FROM dependencies AS builder

# Copy source code
COPY . .

# Build shared package first
RUN npm run -w packages/shared build

# Build local-ai service
RUN npm run -w services/local-ai build

# ============================================================================
# Production stage
# ============================================================================
FROM base AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json .
COPY packages/shared/package.json packages/shared/
COPY services/local-ai/package.json services/local-ai/

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/services/local-ai/dist services/local-ai/dist
COPY --from=builder /app/services/local-ai/scripts services/local-ai/scripts
COPY --from=builder /app/templates templates

# Create uploads directory and set permissions
RUN mkdir -p uploads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "services/local-ai/dist/index.js"]
