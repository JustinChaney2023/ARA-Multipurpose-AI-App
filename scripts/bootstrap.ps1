# =============================================================================
# ARA Caregiver Assistant - Full Bootstrap (Windows)
# Installs all prerequisites then sets up the project.
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

function Write-Header($text) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Cyan
  Write-Host "  $text" -ForegroundColor Cyan
  Write-Host "============================================" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step($n, $text) {
  Write-Host ""
  Write-Host "[$n] $text" -ForegroundColor White -BackgroundColor DarkBlue
}

function Write-Ok($text)   { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  WARN  $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host " ERROR  $text" -ForegroundColor Red }
function Write-Info($text) { Write-Host "        $text" -ForegroundColor Gray }

function Has-Command($cmd) {
  $null = Get-Command $cmd -ErrorAction SilentlyContinue
  return $?
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Header "ARA Caregiver Assistant - Bootstrap"

# =============================================================================
# Step 1 — winget
# =============================================================================
Write-Step 1 "Checking winget"
if (Has-Command winget) {
  Write-Ok "winget found"
} else {
  Write-Err "winget not found. Install 'App Installer' from the Microsoft Store, then re-run."
  exit 1
}

# =============================================================================
# Step 2 — Node.js >= 20.16
# =============================================================================
Write-Step 2 "Node.js >= 20.16.0"
$needNode = $true
if (Has-Command node) {
  $ver = (node --version) -replace 'v', ''
  $parts = $ver -split '\.'
  if ([int]$parts[0] -gt 20 -or ([int]$parts[0] -eq 20 -and [int]$parts[1] -ge 16)) {
    Write-Ok "Node.js v$ver already installed"
    $needNode = $false
  } else {
    Write-Warn "Node.js v$ver is too old (need >= 20.16.0) — upgrading"
  }
}
if ($needNode) {
  Write-Info "Installing Node.js LTS via winget..."
  winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -e
  Refresh-Path
  if (-not (Has-Command node)) {
    Write-Err "Node.js install failed. Install manually from https://nodejs.org/ and re-run."
    exit 1
  }
  Write-Ok "Node.js $(node --version) installed"
}

# =============================================================================
# Step 3 — Rust (required for Tauri desktop build)
# =============================================================================
Write-Step 3 "Rust (required for Tauri desktop build)"
if (Has-Command cargo) {
  Write-Ok "Rust $(cargo --version) already installed"
} else {
  Write-Info "Installing Rust via winget..."
  winget install --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements -e
  Refresh-Path
  # rustup sets up cargo; source the env
  $cargoEnv = "$env:USERPROFILE\.cargo\env"
  if (Test-Path $cargoEnv) { . $cargoEnv }
  Refresh-Path
  if (Has-Command cargo) {
    Write-Ok "Rust $(cargo --version) installed"
  } else {
    Write-Warn "Rust installed but cargo not yet on PATH — open a new terminal after setup completes to build the desktop app"
  }
}

# =============================================================================
# Step 4 — Microsoft C++ Build Tools (Tauri requires MSVC linker)
# =============================================================================
Write-Step 4 "Visual C++ Build Tools (Tauri dependency)"
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = $false
if (Test-Path $vsWhere) {
  $installs = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format value -property installationPath
  $hasBuildTools = ($installs -ne $null -and $installs.Count -gt 0)
}
if ($hasBuildTools) {
  Write-Ok "Visual C++ Build Tools found"
} else {
  Write-Warn "Visual C++ Build Tools not detected"
  Write-Info "Attempting install via winget (this downloads ~4 GB and takes several minutes)..."
  winget install --id Microsoft.VisualStudio.2022.BuildTools `
    --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22000 --includeRecommended" `
    --accept-source-agreements --accept-package-agreements -e 2>$null
  if ($?) {
    Write-Ok "Visual C++ Build Tools installed"
  } else {
    Write-Warn "Could not install automatically. If building the desktop app fails, install manually:"
    Write-Info "  winget install Microsoft.VisualStudio.2022.BuildTools"
    Write-Info "  (add 'Desktop development with C++' workload)"
  }
}

# =============================================================================
# Step 5 — WebView2 (Tauri runtime on Windows)
# =============================================================================
Write-Step 5 "WebView2 Runtime"
$wv2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (Test-Path $wv2Key) {
  Write-Ok "WebView2 already installed (ships with Windows 11)"
} else {
  Write-Info "Installing WebView2 runtime..."
  winget install --id Microsoft.EdgeWebView2Runtime --accept-source-agreements --accept-package-agreements -e
  Write-Ok "WebView2 installed"
}

# =============================================================================
# Step 6 — Ollama (local LLM runtime)
# =============================================================================
Write-Step 6 "Ollama (local LLM runtime)"
if (Has-Command ollama) {
  Write-Ok "Ollama already installed"
} else {
  Write-Info "Installing Ollama via winget..."
  winget install --id Ollama.Ollama --accept-source-agreements --accept-package-agreements -e
  Refresh-Path
  if (Has-Command ollama) {
    Write-Ok "Ollama installed"
  } else {
    Write-Warn "Ollama installed — you may need to restart your terminal for it to appear on PATH"
  }
}

# Pull the recommended model if Ollama is running
if (Has-Command ollama) {
  Write-Info "Checking for Qwen3 model (needed for AI summarisation)..."
  try {
    $tags = Invoke-RestMethod "http://localhost:11434/api/tags" -ErrorAction Stop
    $hasModel = $tags.models | Where-Object { $_.name -like "*qwen3*" }
    if ($hasModel) {
      Write-Ok "Qwen3 model already present"
    } else {
      Write-Info "Pulling qwen3:4b-q4_K_M (~2.3 GB)..."
      ollama pull qwen3:4b-q4_K_M
      Write-Ok "Qwen3 model downloaded"
    }
  } catch {
    Write-Warn "Ollama is not running yet — start it from the Start Menu / system tray, then run:"
    Write-Info "  ollama pull qwen3:4b-q4_K_M"
  }
}

# =============================================================================
# Step 7 — npm install
# =============================================================================
Write-Step 7 "Installing npm dependencies"
Write-Info "Running npm install (this may take a minute)..."
npm install
Write-Ok "npm packages installed"

# =============================================================================
# Step 8 — Build shared package
# =============================================================================
Write-Step 8 "Building @ara/shared"
npm run -w packages/shared build
Write-Ok "Shared package built"

# =============================================================================
# Step 9 — Environment file
# =============================================================================
Write-Step 9 "Environment configuration"
$envDest = "services\local-ai\.env"
if (Test-Path $envDest) {
  Write-Ok ".env already exists"
} else {
  $src = if (Test-Path "services\local-ai\.env.example") { "services\local-ai\.env.example" }
         elseif (Test-Path ".env.example") { ".env.example" }
         else { $null }
  if ($src) {
    Copy-Item $src $envDest
    Write-Ok "Created $envDest from $src"
    Write-Info "Edit it to customise OLLAMA_MODEL, PORT, etc."
  } else {
    Write-Warn "No .env.example found — create services\local-ai\.env manually if needed"
  }
}

# =============================================================================
# Done
# =============================================================================
Write-Header "Bootstrap Complete!"

Write-Host "Quick start:" -ForegroundColor White
Write-Host ""
Write-Host "  Terminal 1 — AI service:" -ForegroundColor Cyan
Write-Host "    npm run dev:service"
Write-Host ""
Write-Host "  Terminal 2 — Web UI (browser, no Tauri needed):" -ForegroundColor Cyan
Write-Host "    npm run dev:web"
Write-Host "    then open http://localhost:1420"
Write-Host ""
Write-Host "  Full desktop app (requires Rust + build tools above):" -ForegroundColor Cyan
Write-Host "    npm run dev:desktop"
Write-Host ""
Write-Host "Other useful commands:" -ForegroundColor White
Write-Host "  npm test              run tests"
Write-Host "  npm run lint          run ESLint"
Write-Host "  npm run format:check  run Prettier check"
Write-Host "  npm run verify        verify full setup"
Write-Host ""

Read-Host -Prompt "Press Enter to exit"
