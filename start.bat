@echo off
rem Двойной щелчок по этому файлу (Windows) запускает игру и открывает браузер.
rem Нужен Node.js или Python — игра сама по себе не требует установки.
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  node scripts\serve.mjs --open
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Node.js not found, starting the built-in Python server: http://localhost:8000/
  python -c "import http.server as h, threading, webbrowser; H = h.SimpleHTTPRequestHandler; H.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json'}); threading.Timer(1, lambda: webbrowser.open('http://localhost:8000/')).start(); h.test(HandlerClass=H, port=8000, bind='127.0.0.1')"
  goto :eof
)

echo Neither Node.js nor Python was found.
echo Open promezhutok.html with a double click - it runs without a server.
pause
