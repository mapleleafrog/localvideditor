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
echo   [1]  Open the Retro Portal         (index.html - no npm)
echo   [2]  Launch Remotion Studio         (edit + live preview)
echo   [3]  Render sample BPM video        (out\soranji-sample.mp4)
echo   [4]  Render Timeline video          (out\timeline.mp4)
echo   [5]  Regenerate portal bundle       (gen:portal)
echo   [6]  Check portal bundle is current (check:portal)
echo   [7]  Regenerate CREDITS.md          (credits)
echo.
echo   [Q]  Quit
echo.
set "choice="
set /p "choice=Choose an option: "

if /i "%choice%"=="1" goto portal
if /i "%choice%"=="2" goto studio
if /i "%choice%"=="3" goto render
if /i "%choice%"=="4" goto rendertimeline
if /i "%choice%"=="5" goto genportal
if /i "%choice%"=="6" goto checkportal
if /i "%choice%"=="7" goto credits
if /i "%choice%"=="Q" goto end
echo.
echo   "%choice%" is not a valid option.
timeout /t 1 >nul
goto menu

:portal
REM Opens in the default browser. Works offline with the committed bundle.
start "" "%~dp0index.html"
goto menu

:studio
echo.
echo Starting Remotion Studio... press Ctrl+C to stop, then it returns here.
call npm run dev
goto menu

:render
echo.
call npm run render
echo.
pause
goto menu

:rendertimeline
echo.
call npm run render:timeline
echo.
pause
goto menu

:genportal
echo.
call npm run gen:portal
echo.
pause
goto menu

:checkportal
echo.
call npm run check:portal
echo.
pause
goto menu

:credits
echo.
call npm run credits
echo.
pause
goto menu

:end
endlocal
exit /b 0
