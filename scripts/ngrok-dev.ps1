# Palmetto + ngrok 联调启动脚本
# 用法:
#   1. 首次: ngrok config add-authtoken <从 https://dashboard.ngrok.com/get-started/your-authtoken 复制>
#   2. 运行: .\scripts\ngrok-dev.ps1

$ErrorActionPreference = "Stop"

$NgrokExe = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $NgrokExe) {
  $NgrokExe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
}
if (-not (Test-Path $NgrokExe)) {
  Write-Host "未找到 ngrok。请运行: winget install ngrok.ngrok" -ForegroundColor Red
  exit 1
}

$ngrokVersion = & $NgrokExe version 2>&1 | Select-Object -Last 1
Write-Host "ngrok 版本: $ngrokVersion" -ForegroundColor Gray
if ($ngrokVersion -match '3\.(\d+)') {
  $minor = [int]$Matches[1]
  if ($minor -lt 20) {
    Write-Host "ngrok 版本过旧，正在更新..." -ForegroundColor Yellow
    & $NgrokExe update
  }
}

# Windows Hyper-V 常保留 7974-8073，8000 无法绑定；默认用 8888
$PalmettoPort = if ($env:PALMETTO_LOCAL_PORT) { $env:PALMETTO_LOCAL_PORT } else { 8888 }

Write-Host "检查 Palmetto (localhost:$PalmettoPort)..." -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri "http://localhost:$PalmettoPort/health" -TimeoutSec 5
  Write-Host "  Palmetto OK: $($health.status)" -ForegroundColor Green
} catch {
  Write-Host "  Palmetto 未运行。请先启动 Docker:" -ForegroundColor Red
  Write-Host "    cd E:\Palmetto" -ForegroundColor Yellow
  Write-Host "    docker run -d --name palmetto-dev -p 8888:8000 palmetto" -ForegroundColor Yellow
  Write-Host "  (勿用 8000：Windows 可能保留 7974-8073 端口段)" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "启动 ngrok 隧道 (端口 $PalmettoPort)..." -ForegroundColor Cyan
Write-Host "保持此窗口打开。公网 URL 将显示在下方。" -ForegroundColor Yellow
Write-Host ""
Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "  1. 复制 Forwarding 行的 https://....ngrok-free.app" -ForegroundColor White
Write-Host "  2. Vercel -> Settings -> Environment Variables" -ForegroundColor White
Write-Host "     PALMETTO_SERVICE_URL = https://xxxx.ngrok-free.app  (无末尾斜杠)" -ForegroundColor White
Write-Host "  3. Redeploy Vercel 项目" -ForegroundColor White
Write-Host "  4. 另开终端运行: .\scripts\test-ngrok-palmetto.ps1 -NgrokUrl https://xxxx.ngrok-free.app" -ForegroundColor White
Write-Host ""

& $NgrokExe http $PalmettoPort
