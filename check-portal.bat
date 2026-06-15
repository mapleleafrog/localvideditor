@echo off
REM Double-click to verify the committed portal bundle is up to date with source.
cd /d "%~dp0"
call npm run check:portal
pause
