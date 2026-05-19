@echo off
title PeerLink Frontend
cd /d "%~dp0ui"

echo Starting PeerLink frontend on http://localhost:3000
echo Press Ctrl+C to stop the server.
echo.
npm run dev
pause
