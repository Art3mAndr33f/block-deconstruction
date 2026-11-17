#!/bin/sh
# Двойной щелчок по этому файлу (macOS, Linux) запускает игру и открывает браузер.
# Нужен Node.js или Python 3 — игра сама по себе не требует установки.
cd "$(dirname "$0")" || exit 1

if command -v node >/dev/null 2>&1; then
  exec node scripts/serve.mjs --open
elif command -v python3 >/dev/null 2>&1; then
  echo "Node.js не найден, запускаю встроенный сервер Python: http://localhost:8000/"
  exec python3 -c "import http.server as h, threading, webbrowser; H = h.SimpleHTTPRequestHandler; H.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json'}); threading.Timer(1, lambda: webbrowser.open('http://localhost:8000/')).start(); h.test(HandlerClass=H, port=8000, bind='127.0.0.1')"
else
  echo "Не найден ни Node.js, ни Python 3."
  echo "Откройте файл promezhutok.html двойным щелчком — он запускается без сервера."
  printf "Нажмите Enter, чтобы закрыть окно... "
  read -r _
fi
