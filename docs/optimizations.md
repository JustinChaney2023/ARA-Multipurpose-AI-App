# Ollama Performance Optimizations

This document describes the performance optimizations implemented for Ollama LLM
integration in the ARA Caregiver Assistant.

## Overview

Instead of switching to TurboLLM or AirLLM, we've implemented several
optimizations to the existing Ollama integration to improve performance and
reduce latency.

## Implemented Optimizations

### 1. GPU Auto-Detection and Configuration

**File:** `services/local-ai/src/ollamaClient.ts`

- Automatically detects GPU availability and VRAM
- Configures GPU layer offloading based on available VRAM
- Supports multi-GPU setups with tensor splitting
- Falls back to CPU inference when no GPU is available

**Configuration:**

```bash
# Enable GPU acceleration (default: true)
OLLAMA_GPU_ENABLED=true

# GPU layers (-1 = auto-detect, 0 = CPU only, >0 = specific layers)
OLLAMA_NUM_GPU_LAYERS=-1

# Multi-GPU support
OLLAMA_TENSOR_SPLIT=3,1  # 75% on GPU 0, 25% on GPU 1
```

### 2. HTTP Connection Pooling

**File:** `services/local-ai/src/ollamaClient.ts`

- Reuses HTTP connections to Ollama
- Reduces connection overhead for repeated requests
- Configurable pool size and keep-alive settings

**Configuration:**

```bash
# Enable connection pooling (default: true)
OLLAMA_POOL_ENABLED=true
OLLAMA_POOL_MAX_SOCKETS=10
OLLAMA_POOL_KEEP_ALIVE=true
```

### 3. Response Caching

**File:** `services/local-ai/src/ollamaClient.ts`

- Caches LLM responses for similar prompts
- LRU (Least Recently Used) eviction policy
- Normalizes prompts for better cache hits (removes extra whitespace)
- TTL-based expiration

**Configuration:**

```bash
# Enable response caching (default: true)
OLLAMA_CACHE_ENABLED=true
OLLAMA_CACHE_TTL=300000        # 5 minutes
OLLAMA_CACHE_MAX_SIZE=100      # Max cached responses
```

**Cache Statistics Endpoint:**

```bash
GET /admin/cache
```

**Clear Cache:**

```bash
POST /admin/cache/clear
```

### 4. Exponential Backoff Retry

**File:** `services/local-ai/src/ollamaClient.ts`

- Automatically retries failed requests with exponential backoff
- Configurable max retry attempts
- Prevents overwhelming Ollama during startup

**Configuration:**

```bash
OLLAMA_MAX_RETRIES=2
```

### 5. Streaming Support

**File:** `services/local-ai/src/ollama.ts`

- Supports streaming responses for real-time UI updates
- Reduces perceived latency for long generations

**Usage:**

```typescript
import { generateWithStreaming } from './ollama.js';

await generateWithStreaming(
  text,
  chunk => console.log(chunk), // Called for each token
  imagePath
);
```

### 6. Enhanced Model Options

**File:** `services/local-ai/src/config/index.ts`

Added fine-grained control over generation parameters:

```bash
# Performance tuning
OLLAMA_NUM_THREAD=0              # CPU threads (0 = auto)
OLLAMA_NUM_BATCH=512             # Batch size
OLLAMA_NUM_PREDICT=1500          # Max tokens

# Generation quality
OLLAMA_TEMPERATURE=0.1
OLLAMA_TOP_P=0.9
OLLAMA_TOP_K=40
OLLAMA_REPEAT_PENALTY=1.0
OLLAMA_FREQUENCY_PENALTY=0.0
OLLAMA_PRESENCE_PENALTY=0.0
```

### 7. Performance Monitoring Endpoints

**File:** `services/local-ai/src/index.ts`

New admin endpoints for monitoring:

```bash
# Health check with optimization status
GET /health

# Cache statistics
GET /admin/cache

# Performance configuration
GET /admin/performance

# Clear cache
POST /admin/cache/clear
```

## Configuration Summary

All optimizations can be configured via environment variables in
`services/local-ai/.env`:

```bash
# ============================================================================
# GPU Acceleration
# ============================================================================
OLLAMA_GPU_ENABLED=true
OLLAMA_NUM_GPU_LAYERS=-1

# ============================================================================
# Performance Tuning
# ============================================================================
OLLAMA_NUM_THREAD=0
OLLAMA_NUM_BATCH=512
OLLAMA_NUM_PREDICT=1500

# ============================================================================
# Caching
# ============================================================================
OLLAMA_CACHE_ENABLED=true
OLLAMA_CACHE_TTL=300000
OLLAMA_CACHE_MAX_SIZE=100

# ============================================================================
# Connection Pooling
# ============================================================================
OLLAMA_POOL_ENABLED=true
OLLAMA_POOL_MAX_SOCKETS=10

# ============================================================================
# Retries
# ============================================================================
OLLAMA_MAX_RETRIES=2
```

## Expected Performance Improvements

| Optimization         | Expected Improvement                         |
| -------------------- | -------------------------------------------- |
| GPU Layer Offloading | 5-10x faster inference (with GPU)            |
| Connection Pooling   | 10-20% reduced latency for repeated requests |
| Response Caching     | 50-80% faster for similar prompts            |
| Retry with Backoff   | Improved reliability during Ollama startup   |
| Streaming            | Better perceived latency for UI              |

## Backward Compatibility

All optimizations are:

- **Opt-in by default** (enabled but can be disabled)
- **Backward compatible** - existing code continues to work
- **Graceful degradation** - falls back to CPU if GPU unavailable

## Migration Guide

No migration needed! The optimizations are automatically applied when you
update. To customize:

1. Copy `.env.example` to `.env`:

   ```bash
   cp services/local-ai/.env.example services/local-ai/.env
   ```

2. Adjust settings as needed

3. Restart the service:
   ```bash
   npm run dev:service
   ```

## Troubleshooting

### High Memory Usage

If you experience high memory usage:

```bash
# Disable caching
OLLAMA_CACHE_ENABLED=false

# Reduce cache size
OLLAMA_CACHE_MAX_SIZE=50

# Reduce batch size
OLLAMA_NUM_BATCH=256
```

### GPU Not Detected

```bash
# Check Ollama GPU status
ollama ps

# Manually set GPU layers
OLLAMA_NUM_GPU_LAYERS=20
```

### Slow First Request

First request may be slow while Ollama loads the model. Subsequent requests will
be faster due to:

- Model staying loaded in memory (`keep_alive: 10m`)
- Connection pooling
- Response caching

## Comparison: Ollama vs AirLLM vs TurboLLM

| Feature              | Ollama (Optimized)    | AirLLM             | TurboLLM           |
| -------------------- | --------------------- | ------------------ | ------------------ |
| **Architecture**     | HTTP API              | Python Library     | Python Library     |
| **GPU Support**      | ✅ Excellent          | ✅ Good            | ❌ CPU only        |
| **Model Size**       | Up to 405B            | Up to 405B         | 50M-300M           |
| **Ease of Use**      | ✅ Simple HTTP        | ❌ Requires Python | ❌ Requires Python |
| **Integration**      | ✅ Fits current stack | ❌ Major refactor  | ❌ Major refactor  |
| **Production Ready** | ✅ Yes                | ⚠️ Beta            | ❌ Experimental    |

## Conclusion

The optimized Ollama integration provides:

- **Better performance** through GPU offloading and caching
- **No architectural changes** - works with existing code
- **Production stability** - mature, well-tested codebase
- **Flexibility** - all optimizations are configurable

For most use cases, these optimizations provide sufficient performance without
the complexity of switching to AirLLM or TurboLLM.
