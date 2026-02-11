# Best Models for CPU-Only Systems

No GPU? No problem! These models run well on CPU-only laptops.

## Top Recommendations for CPU

### 1. phi3:mini ⭐ BEST for CPU
- **Size:** 2.0 GB
- **RAM needed:** 4-6GB free
- **CPU speed:** 10-20 seconds (text), 30-60s (vision)
- **Quality:** Excellent for forms
- **Why:** Optimized by Microsoft for edge devices

```powershell
ollama pull phi3:mini
# For vision (multimodal):
ollama pull phi3:vision
```

### 2. qwen2.5:1.8b ⭐ FASTEST
- **Size:** 1.1 GB
- **RAM needed:** 3-4GB free
- **CPU speed:** 5-15 seconds
- **Quality:** Good for structured data
- **Why:** Tiny but capable

```powershell
ollama pull qwen2.5:1.8b
```

### 3. llama3.2:3b
- **Size:** 2.0 GB
- **RAM needed:** 4-6GB free
- **CPU speed:** 15-30 seconds
- **Quality:** Very good
- **Why:** Meta's efficient architecture

```powershell
ollama pull llama3.2:3b
```

### 4. moondream (Vision on CPU)
- **Size:** 1.6 GB
- **RAM needed:** 4GB free
- **CPU speed:** 20-40 seconds
- **Quality:** Good for handwriting
- **Why:** Purpose-built for vision on limited hardware

```powershell
ollama pull moondream
```

## Models to AVOID on CPU

| Model | Why Skip |
|-------|----------|
| qwen:4b | Too slow (60s+) |
| llava:7b | Too large, very slow |
| llama3:8b | Needs 16GB+ RAM |
| mistral:7b | Slow on CPU |

## CPU Optimization Tips

### 1. Close Other Apps
Free up RAM for the model:
```powershell
# Check available memory
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory

# Need at least 4GB free
```

### 2. Use Quantized Models
All Ollama models are already quantized (compressed). Stick to:
- Q4 quantization (default)
- Models under 2.5GB

### 3. Adjust Context Length
If responses are slow:
```powershell
# In your .env file or terminal
$env:OLLAMA_CONTEXT_LENGTH="2048"
```

### 4. Let It Warm Up
First run loads model into RAM (slow). Subsequent runs are faster.

## My Recommendation for Your Setup

**For CPU-only with handwriting:**

```powershell
# 1. Pull the best CPU vision model
ollama pull moondream

# 2. Use it
$env:OLLAMA_MODEL="moondream"
npm run dev:service
```

**Why moondream?**
- Smallest vision model (1.6GB)
- Made specifically for edge devices
- Good at reading handwriting
- Works on 4GB RAM laptops

**Alternative if moondream is too slow:**
```powershell
# Text-only, very fast
ollama pull qwen2.5:1.8b
$env:OLLAMA_MODEL="qwen2.5:1.8b"
```

## Speed Comparison on CPU (Typical Laptop)

| Model | First Load | Extraction | Memory |
|-------|------------|------------|--------|
| qwen2.5:1.8b | 30s | 5-10s | 3GB |
| phi3:mini | 45s | 10-20s | 4GB |
| moondream | 60s | 20-40s | 4GB |
| llava:7b | 120s | 60-120s | 8GB |

## Quick Test

After pulling a model, test speed:

```powershell
# Time the model
$time = Measure-Command {
  $body = '{"model":"moondream","prompt":"Read this: Name: John","stream":false}'
  Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -ContentType "application/json" -Body $body
}
Write-Host "Response time: $($time.TotalSeconds) seconds"
```

If under 30 seconds, it's usable!
