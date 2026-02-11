# Handwriting Recognition with Vision LLMs

For rough handwritten notes, standard OCR (tesseract.js) often fails. We support **multimodal LLMs** that can see the image directly.

## How It Works

1. **Image uploaded** → OCR runs (tesseract.js)
2. **If OCR confidence < 50%** → Vision LLM takes over
3. **Vision LLM sees the image directly** → Extracts text from handwriting
4. **Structured output** → Form fields populated

## Recommended Vision Models

### 1. llava:7b (Best balance)
- **Size:** 3.8 GB
- **Speed:** 30-60 seconds per image
- **Accuracy:** Good for handwriting
- **RAM needed:** 8GB+ free

```powershell
ollama pull llava:7b
```

### 2. bakllava (Smaller, faster)
- **Size:** 2.5 GB
- **Speed:** 20-40 seconds per image
- **Accuracy:** Good for forms
- **RAM needed:** 6GB+ free

```powershell
ollama pull bakllava
```

### 3. moondream (Tiny, fastest)
- **Size:** 1.6 GB
- **Speed:** 10-20 seconds per image
- **Accuracy:** Basic handwriting
- **RAM needed:** 4GB+ free

```powershell
ollama pull moondream
```

## Setup

```powershell
# 1. Pull a vision model
ollama pull llava:7b

# 2. Set as default
$env:OLLAMA_MODEL="llava:7b"

# 3. Restart the service
npm run dev:service
```

## How to Use

Just upload handwritten images as normal. The app will:
1. Try OCR first
2. If confidence is low (< 50%), automatically use vision LLM
3. Show "Vision LLM" in the UI

## Tips for Best Results

1. **Good lighting** - Avoid shadows on the paper
2. **High resolution** - At least 300 DPI or clear phone photos
3. **Flat paper** - No folds or curves
4. **Dark ink** - Blue/black pen works best

## Troubleshooting

**Still getting OCR-only?**
- Check model is vision-capable: `ollama list`
- Verify it's loaded: `http://localhost:11434/api/tags`

**Too slow?**
- Use `bakllava` or `moondream` instead of `llava:7b`
- Or disable vision: `$env:DISABLE_LLM="true"`

**Out of memory?**
- Close other apps
- Use smaller model (`moondream`)
- Or stick with OCR-only mode

## Comparison

| Method | Speed | Handwriting | Setup |
|--------|-------|-------------|-------|
| OCR-only | Fast | Poor | None |
| Text LLM | Medium | Fair | qwen:4b |
| Vision LLM | Slow | Good | llava:7b |

For critical handwriting, Vision LLM is worth the wait!
