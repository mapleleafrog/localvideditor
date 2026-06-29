@echo off
REM ============================================================
REM  Soranji Studio — the drag-and-drop video editor.
REM  Double-click to launch. Opens at http://localhost:5173
REM  (clip select / drag / delete, on-canvas transform, Audio
REM   tab for soundtrack + beat-sync, in-app Render button).
REM ============================================================
cd /d "%~dp0"
echo.
echo   Starting Soranji Studio (drag-and-drop editor)...
echo   It will open in your browser at http://localhost:5173
echo   Press Ctrl+C in this window to stop.
echo.
call npm run editor
pause
