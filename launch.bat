@echo off
REM ============================================================
REM  soranji-vfx launcher — double-click to open this menu.
REM  Runs from the repo root regardless of where it's invoked.
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

:menu
cls
echo ============================================================
echo             SORANJI-VFX  ::  LAUNCHER
echo ============================================================
echo.
echo   [1]  Soranji Studio  - drag-and-drop EDITOR   (the main app; also editor.bat)
echo   [2]  Retro Portal    - quick effect preview   (index.html, no npm)
echo   [3]  Remotion Studio - effect galleries / dev (npm run dev)
echo.
echo   (Render your video from the editor's Render button. Dev/maintenance
echo    commands - sample renders, gen:portal, credits - are still available
echo    via "npm run ^<name^>" if you ever need them.)
echo.
echo   [Q]  Quit
echo.
set "choice="
set /p "choice=Choose an option: "

if /i "%choice%"=="1" goto editor
if /i "%choice%"=="2" goto portal
if /i "%choice%"=="3" goto studio
if /i "%choice%"=="Q" goto end
echo.
echo   "%choice%" is not a valid option.
timeout /t 1 >nul
goto menu

:editor
echo.
echo Starting Soranji Studio editor... opens at http://localhost:5173
echo Press Ctrl+C to stop, then it returns here.
call npm run editor
goto menu

:portal
REM Opens in the default browser. Works offline with the committed bundle.
start "" "%~dp0index.html"
goto menu

:studio
echo.
echo Starting Remotion Studio (effect galleries + props/JSON)...
echo Press Ctrl+C to stop, then it returns here.
call npm run dev
goto menu

:end
endlocal
exit /b 0
