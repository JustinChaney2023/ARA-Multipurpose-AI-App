# CPU-Only Optimization Guide

If you're running without a GPU (Intel/AMD graphics on Windows, or no dedicated
GPU), this guide will help you get the best performance.

## Quick Fix

**Use `phi3:mini` model** - it's optimized for CPU and gives the best
speed/quality balance.

```powershell
# 1. Pull the model
ollama pull phi3:mini

# 2. Update your .env file
Set-Content -Path "services/local-ai/.env" -Value 'OLLAMA_MODEL=phi3:mini'

# 3. Restart the service
npm run dev:service
```

## Benchmark Your System

Run the benchmark script to test different models:

```powershell
# Make sure Ollama is running first
ollama serve

# In another terminal, run benchmark
.\scripts\benchmark-models.ps1
```

Typical results on CPU-only laptops:

| Model        | Speed      | Quality    | Best For                  |
| ------------ | ---------- | ---------- | ------------------------- |
| phi3:mini    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   | General use (RECOMMENDED) |
| qwen2.5:1.5b | ⭐⭐⭐⭐   | ⭐⭐⭐     | Speed priority            |
| qwen2.5:0.5b | ⭐⭐⭐⭐⭐ | ⭐⭐       | Very slow hardware        |
| qwen3:4b     | ⭐⭐       | ⭐⭐⭐⭐⭐ | Quality priority (slow)   |

## Environment Variables for CPU

Edit `services/local-ai/.env`:

```bash
# Use the fastest CPU model
OLLAMA_MODEL=phi3:mini

# Reduce tokens for faster response (default: 1500)
OLLAMA_NUM_PREDICT=600

# Smaller context window (default: 8192)
OLLAMA_NUM_CTX=4096

# Reduce batch size (default: 512)
OLLAMA_NUM_BATCH=256

# Shorter timeouts
OLLAMA_TIMEOUT=25000
OLLAMA_VISION_TIMEOUT=45000
```

## Last Resort: Disable LLM

If AI is still too slow, disable it entirely:

```bash
DISABLE_LLM=true
```

The app will work fine with rule-based extraction (OCR only). You'll just need
to fill in more fields manually.

## Ollama vs llama.cpp

**Should you switch to llama.cpp?**

Probably not worth it. Here's why:

| Feature      | Ollama       | llama.cpp              |
| ------------ | ------------ | ---------------------- |
| Setup        | Easy         | Complex                |
| Performance  | Good         | Slightly better (~10%) |
| Model mgmt   | Built-in     | Manual                 |
| API          | REST         | Need to add server     |
| Your project | ✅ Supported | ❌ Needs rewrite       |

Ollama is essentially a user-friendly wrapper around llama.cpp. The core
performance is the same.

## Windows-Specific Notes

On Windows, Ollama only supports **NVIDIA GPUs**. If you have:

- Intel Iris Xe / UHD Graphics → CPU only
- AMD Radeon → CPU only
- NVIDIA GTX/RTX → GPU acceleration ✓

## macOS / Linux

On macOS and Linux, you have more options:

- **macOS**: Metal acceleration works with Apple Silicon (M1/M2/M3) and Intel
  Macs
- **Linux**: ROCm supports AMD GPUs, CUDA for NVIDIA

## Troubleshooting Slow Performance

1. **Check CPU usage** - Is your CPU maxed out during inference?

   ```powershell
   Get-Process ollama | Select-Object CPU
   ```

2. **Check RAM** - Are you swapping to disk?

   ```powershell
   Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize
   ```

3. **Close other apps** - Free up RAM for the model

4. **Use smaller model** - See benchmark results above

5. **Disable warmup** if RAM is tight:
   ```bash
   DISABLE_WARMUP=true
   ```
