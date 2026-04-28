# Model Benchmark Script for CPU-Only Systems
# Tests different Ollama models to find the fastest for your hardware

param(
    [string[]]$Models = @("phi3:mini", "qwen2.5:1.5b", "qwen2.5:0.5b"),
    [int]$Runs = 3
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Ollama Model Benchmark (CPU Mode)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Test prompt similar to what the app uses
$testPrompt = @"
Extract form data from these caregiver notes:
Visit Date: March 15, 2024
Time: 2:30 PM
Location: Client home

The care coordinator met with Mrs. Johnson at her residence. 
Client appeared well-groomed and in good spirits. Home environment 
was clean and safe. Client reported taking medications as prescribed.
No health concerns noted. Current services: personal care 20hrs/week.
Goals: maintaining independence, medication management. Follow-up: 
schedule doctor appointment for next month.

Extract: date, time, location, health status, services, goals, follow-up.
JSON only:
"@

$results = @()

foreach ($model in $Models) {
    Write-Host "Testing model: $model" -ForegroundColor Yellow
    
    # Check if model exists
    $modelList = ollama list 2>$null
    if ($modelList -notmatch $model.Split(":")[0]) {
        Write-Host "  Model not found. Pulling..." -ForegroundColor DarkYellow
        ollama pull $model
    }
    
    $times = @()
    $success = $true
    
    for ($i = 1; $i -le $Runs; $i++) {
        Write-Host "  Run $i/$Runs..." -NoNewline
        
        $body = @{
            model = $model
            prompt = $testPrompt
            stream = $false
            options = @{
                temperature = 0.1
                num_predict = 300
                num_ctx = 2048
            }
        } | ConvertTo-Json -Compress
        
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
                -Method Post -ContentType "application/json" -Body $body `
                -TimeoutSec 60 -ErrorAction Stop
            $sw.Stop()
            $times += $sw.Elapsed.TotalSeconds
            Write-Host " $($sw.Elapsed.TotalSeconds.ToString('F1'))s" -ForegroundColor Green
        }
        catch {
            $sw.Stop()
            $success = $false
            Write-Host " FAILED" -ForegroundColor Red
        }
        
        Start-Sleep -Milliseconds 500
    }
    
    if ($success -and $times.Count -gt 0) {
        $avg = ($times | Measure-Object -Average).Average
        $min = ($times | Measure-Object -Minimum).Minimum
        $max = ($times | Measure-Object -Maximum).Maximum
        
        $results += [PSCustomObject]@{
            Model = $model
            AverageSeconds = [math]::Round($avg, 1)
            MinSeconds = [math]::Round($min, 1)
            MaxSeconds = [math]::Round($max, 1)
            Rating = if ($avg -lt 5) { "Excellent" }
                       elseif ($avg -lt 10) { "Good" }
                       elseif ($avg -lt 20) { "Slow" }
                       else { "Too Slow" }
        }
    }
    else {
        $results += [PSCustomObject]@{
            Model = $model
            AverageSeconds = "FAILED"
            MinSeconds = "-"
            MaxSeconds = "-"
            Rating = "Error"
        }
    }
    
    Write-Host ""
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Results Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
$results | Format-Table -AutoSize

# Recommendation
$fastest = $results | Where-Object { $_.AverageSeconds -is [double] } | 
           Sort-Object AverageSeconds | Select-Object -First 1

if ($fastest) {
    Write-Host "Recommendation: Use '$($fastest.Model)' for best CPU performance" -ForegroundColor Green
    Write-Host "Set in services/local-ai/.env: OLLAMA_MODEL=$($fastest.Model)" -ForegroundColor DarkGray
}
