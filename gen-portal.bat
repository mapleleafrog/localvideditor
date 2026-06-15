@echo off
REM Double-click to regenerate the portal bundle from src/effects/portable.ts.
cd /d "%~dp0"
call npm run gen:portal
pause
