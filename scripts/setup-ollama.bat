@echo off
echo ========================================
echo   Ollama Setup
echo ========================================
echo.

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo Ollama not found. Please install:
    echo   winget install Ollama.Ollama
    echo   Or: https://ollama.com/download
    exit /b 1
)

echo Downloading qwen:4b model...
echo This will download ~2.3GB and may take several minutes.
pause

ollama pull qwen:4b

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Setup complete!
    echo   Run: npm run dev:service
    echo ========================================
) else (
    echo Failed to download model
)
