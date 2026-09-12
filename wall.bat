@echo off
REM ============================================================
REM  Wall mode quick start — double-click to try the collage wall.
REM   1. pulls the latest of the branch you are on (Wall mode is on master)
REM   2. installs npm deps on first run
REM   3. starts Soranji Studio and opens it in your browser
REM  Then in the app: Import projects\wall-demo.json -> click "Wall".
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo   ============================================================
echo     SORANJI-VFX  ::  WALL MODE
echo   ============================================================
echo.

REM --- 1. latest code (stays on the current branch) ---------------
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CUR=%%b"
echo   Branch: %CUR% - pulling latest ...
git pull --ff-only
if errorlevel 1 echo   (pull skipped - local changes or no network; continuing with what is here)

REM --- 2. deps ---------------------------------------------------
if not exist node_modules (
  echo.
  echo   First run: installing dependencies ^(a few minutes^)...
  call npm install || goto fail
)

REM --- 3. editor + browser ---------------------------------------
echo.
echo   Starting Soranji Studio at http://localhost:5173
echo.
echo   In the app:  [Import] projects\wall-demo.json  ->  click [Wall]  ->  toggle [Live]
echo   Or start fresh: [+ Create a wall clip], drop photos, frame a shot, [Set as scene].
echo.
echo   Press Ctrl+C in this window to stop the editor.
echo.
start "" cmd /c "timeout /t 6 >nul & start "" http://localhost:5173"
call npm run editor
goto end

:fail
echo.
echo   Something failed - see the messages above.
pause
exit /b 1

:end
endlocal
pause
exit /b 0
