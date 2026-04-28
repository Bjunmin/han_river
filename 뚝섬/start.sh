#!/bin/bash
# AIS 서버 자동 재시작 스크립트
# 서버가 죽으면 3초 후 자동으로 다시 실행

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/restart.log"
mkdir -p "$SCRIPT_DIR/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] AIS 서버 시작" >> "$LOG_FILE"

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 서버 실행 중..." >> "$LOG_FILE"

  # nvm 사용 시 node 경로 직접 지정 (아래 경로를 실제 환경에 맞게 수정)
  # which node 명령으로 확인 가능
  node "$SCRIPT_DIR/dist/main.js"

  EXIT_CODE=$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 서버 종료 (exit code: $EXIT_CODE), 3초 후 재시작..." >> "$LOG_FILE"
  sleep 3
done
