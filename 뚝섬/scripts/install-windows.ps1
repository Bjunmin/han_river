#
# 한강 AIS 서버 — Windows 자동 시작 설치 스크립트
#
# 요구사항:
#   - Node.js 22+ 설치
#   - PowerShell 관리자 권한으로 실행
#
# 실행:
#   cd C:\han_river_server
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
#
# 이 스크립트는 다음을 수행합니다:
#   1. npm install (의존성 설치)
#   2. npm run build
#   3. PM2 + pm2-windows-startup 글로벌 설치
#   4. .env 템플릿 복사 (없을 경우)
#   5. 로그/데이터 디렉토리 생성
#   6. PM2 로 서비스 등록 후 윈도우 부팅 자동 시작 구성
#

$ErrorActionPreference = 'Stop'

function Write-Section($label) {
    Write-Host ''
    Write-Host "==== $label ====" -ForegroundColor Cyan
}

# 스크립트 위치에서 프로젝트 루트로 이동
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot
Write-Host "프로젝트 루트: $projectRoot"

Write-Section 'Node / npm 버전 확인'
node --version
npm --version

Write-Section '디렉토리 준비 (logs / data)'
New-Item -ItemType Directory -Force -Path .\logs | Out-Null
New-Item -ItemType Directory -Force -Path .\data | Out-Null

Write-Section '.env 템플릿 복사'
if (-not (Test-Path .\.env)) {
    if (Test-Path .\.env.example) {
        Copy-Item .\.env.example .\.env
        Write-Host '.env 생성됨 (템플릿 기반). SITE_MODE / SITE_NAME / CENTRAL_WS_URL 을 편집하세요.'
    } else {
        @"
# 한강 AIS — 기본 환경변수
PORT=7400
DB_TYPE=better-sqlite3
DB_PATH=./data/han_river.sqlite

# standalone | combined | central | edge
# 여의도(메인 PC, 시리얼 + 중앙): combined
# 뚝섬(엣지 PC): edge
SITE_MODE=combined
SITE_NAME=여의도

# edge 모드에서만 사용 — 중앙 서버 WS URL
# CENTRAL_WS_URL=ws://<central-pc-ip>:7410/ingest

LOG_DIR=./logs
LOG_RETENTION_DAYS=30
HISTORY_RETENTION_DAYS=14
DB_SIZE_WARN_MB=500
SERIAL_DROUGHT_MS=120000
DEDUP_WINDOW_MS=3000
"@ | Set-Content -Encoding UTF8 .\.env
        Write-Host '.env 생성됨 (기본값). SITE_MODE / SITE_NAME / CENTRAL_WS_URL 을 편집하세요.'
    }
} else {
    Write-Host '.env 이미 존재 — 스킵'
}

Write-Section '의존성 설치 (npm install)'
npm install

Write-Section '빌드 (npm run build)'
npm run build

Write-Section 'PM2 글로벌 설치'
npm install -g pm2 pm2-windows-startup

Write-Section 'PM2 로 서비스 시작'
pm2 delete ais-server 2>$null
pm2 start ecosystem.config.js --env production
pm2 save

Write-Section 'Windows 부팅 시 자동 시작 등록'
pm2-startup install

Write-Host ''
Write-Host '완료!' -ForegroundColor Green
Write-Host '상태 확인: pm2 status'
Write-Host '로그: pm2 logs han-river-ais'
Write-Host '또는 파일로: .\logs\app-YYYY-MM-DD.log  /  .\logs\error-YYYY-MM-DD.log  /  .\logs\ais-YYYY-MM-DD.log'
Write-Host '헬스체크: curl http://localhost:7400/ais/health'
