# 测试 ngrok -> Palmetto 与 Vercel 代理
# 用法:
#   .\scripts\test-ngrok-palmetto.ps1 -NgrokUrl https://xxxx.ngrok-free.app
#   .\scripts\test-ngrok-palmetto.ps1 -NgrokUrl https://xxxx.ngrok-free.app -VercelApi https://shopify-13s4.vercel.app/api

param(
  [Parameter(Mandatory = $true)]
  [string]$NgrokUrl,

  [string]$VercelApi = "https://shopify-13s4.vercel.app/api",

  [string]$StepFile = "E:\1\+小批量定制化服务\+CNC\SKS CHASSI B V2.stp"
)

$NgrokUrl = $NgrokUrl.TrimEnd("/")
$VercelApi = $VercelApi.TrimEnd("/")

Write-Host "=== 1. ngrok -> Palmetto /health ===" -ForegroundColor Cyan
try {
  $h = Invoke-RestMethod -Uri "$NgrokUrl/health" -TimeoutSec 30
  Write-Host "OK: $($h | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Host "FAIL: $_" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "=== 2. ngrok -> Palmetto /api/analyze/modules ===" -ForegroundColor Cyan
try {
  $m = Invoke-RestMethod -Uri "$NgrokUrl/api/analyze/modules" -TimeoutSec 30
  Write-Host "OK: modules=$($m.total_count)" -ForegroundColor Green
} catch {
  Write-Host "FAIL: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 3. Vercel analyze-step-features GET (需已设置 PALMETTO_SERVICE_URL=$NgrokUrl 并 Redeploy) ===" -ForegroundColor Cyan
try {
  $v = Invoke-RestMethod -Uri "$VercelApi/analyze-step-features" -TimeoutSec 60
  if ($v.success) {
    Write-Host "OK: Vercel 可访问 Palmetto" -ForegroundColor Green
    Write-Host ($v | ConvertTo-Json -Depth 3)
  } else {
    Write-Host "WARN: $($v.message)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "FAIL (请确认 Vercel 环境变量与 Redeploy): $_" -ForegroundColor Yellow
}

if (Test-Path $StepFile) {
  Write-Host ""
  Write-Host "=== 4. 本地直连 Palmetto 分析 STEP ===" -ForegroundColor Cyan
  $env:PALMETTO_SERVICE_URL = "http://localhost:8000"
  node "$PSScriptRoot\test-palmetto-features.mjs" $StepFile
} else {
  Write-Host ""
  Write-Host "跳过 STEP 分析测试 (文件不存在): $StepFile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "联调检查完成。" -ForegroundColor Green
