# Qwen3-4B Model Setup Guide

## Quick Start

### 1. Install Ollama

Download from https://ollama.ai and install it.

### 2. Pull Qwen3-4B with Q4_K_M Quantization

```bash
# Pull the pre-quantized model (~2.3GB download)
ollama pull qwen3:4b-q4_K_M
```

Or create a custom Modelfile:

```bash
# Create the model from our Modelfile
cd services/local-ai
ollama create qwen3-ara -f Modelfile
```

### 3. Verify Installation

```bash
# Check if model is available
ollama list

# Test the model
ollama run qwen3:4b-q4_K_M
```

### 4. Start the Service

```bash
# The service will automatically detect and use Qwen3
npm run dev:service
```

## Model Specifications

| Spec           | Value                     |
| -------------- | ------------------------- |
| Base Model     | Qwen3-4B                  |
| Quantization   | Q4_K_M (4-bit, medium)    |
| Model Size     | ~2.3 GB                   |
| VRAM Required  | ~3 GB                     |
| Context Length | 8,192 tokens              |
| Speed          | ~50-100 tokens/sec on GPU |

## Quantization Options

### Q4_K_M (Recommended)

```bash
ollama pull qwen3:4b-q4_K_M
```

- Best balance of quality and speed
- 2.3GB download
- Runs on 4GB VRAM
- Good for production use

### Q8_0 (Higher Quality)

```bash
ollama pull qwen3:4b-q8_0
```

- Better accuracy for complex extraction
- 3.5GB download
- Requires 6GB+ VRAM
- Use if you have GPU memory to spare

### FP16 (Maximum Quality)

```bash
ollama pull qwen3:4b
```

- Best possible quality
- 7.5GB download
- Requires 10GB+ VRAM
- Only for high-end GPUs

## Performance Tuning

### For CPU-Only Systems

```env
OLLAMA_MODEL=qwen3:4b-q4_K_M
OLLAMA_CONTEXT_LENGTH=4096
```

### For Low-VRAM GPUs (<4GB)

```env
OLLAMA_MODEL=qwen3:4b-q4_K_M
OLLAMA_CONTEXT_LENGTH=4096
```

### For High-End GPUs (>8GB)

```env
OLLAMA_MODEL=qwen3:4b-q8_0
OLLAMA_CONTEXT_LENGTH=16384
```

## Troubleshooting

### "Model not found" Error

```bash
# Pull the model manually
ollama pull qwen3:4b-q4_K_M

# Verify it's available
ollama list
```

### Out of Memory Errors

```bash
# Use a smaller quantization
ollama pull qwen3:4b-q4_K_M

# Or reduce context length in .env
OLLAMA_CONTEXT_LENGTH=4096
```

### Slow Performance

1. Check if GPU is being used: `ollama ps`
2. Ensure CUDA/ROCm drivers are installed
3. Try reducing context length
4. Close other applications using GPU

### Timeout Errors

```env
# Increase timeout in .env
OLLAMA_TIMEOUT=120000
```

## System Requirements

### Minimum

- CPU: Any modern x86_64 or ARM64
- RAM: 8GB
- Storage: 5GB free
- OS: Windows 10+, macOS 12+, Ubuntu 20.04+

### Recommended

- CPU: 4+ cores
- RAM: 16GB
- GPU: 4GB+ VRAM (NVIDIA or AMD)
- Storage: SSD with 10GB free

### Optimal

- CPU: 8+ cores
- RAM: 32GB
- GPU: 8GB+ VRAM (NVIDIA RTX or AMD RX)
- Storage: NVMe SSD

## Comparison with Other Models

| Model           | Size  | Quality    | Speed      | VRAM |
| --------------- | ----- | ---------- | ---------- | ---- |
| qwen2.5:0.5b    | 0.3GB | ⭐⭐       | ⭐⭐⭐⭐⭐ | 1GB  |
| qwen3:4b-q4_K_M | 2.3GB | ⭐⭐⭐⭐   | ⭐⭐⭐⭐   | 3GB  |
| qwen3:4b-q8_0   | 3.5GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     | 5GB  |
| llama3:8b       | 4.7GB | ⭐⭐⭐⭐   | ⭐⭐⭐     | 6GB  |

## Updating the Model

```bash
# Update to latest version
ollama pull qwen3:4b-q4_K_M

# Remove old version to save space
ollama rm qwen3:4b-q4_K_M:old-tag
```

## Uninstalling

```bash
# Remove the model
ollama rm qwen3:4b-q4_K_M

# Uninstall Ollama (platform-specific)
# See ollama.ai documentation
```
