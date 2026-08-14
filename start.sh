#!/usr/bin/env bash
# 민원 연결의 神 — macOS / Linux 실행기. Windows는 start.bat 을 쓰세요.
set -e
cd "$(dirname "$0")"

command -v node >/dev/null || {
  echo "[오류] Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치하세요."
  exit 1
}

[ -d node_modules ] || {
  echo "처음 실행이라 패키지를 내려받습니다. 몇 분 걸릴 수 있습니다..."
  npm install
}

echo "서버를 켭니다 → http://localhost:5173  (종료: Ctrl+C)"
(sleep 3 && (open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null)) &
npm run dev
