@echo off
REM PlantUMLAssist launcher (Windows)
REM Starts server.py in a new console window and opens the app in the default browser.

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found in PATH. Install Python 3 and retry.
  pause
  exit /b 1
)

echo Starting PlantUMLAssist server...
start "PlantUMLAssist" cmd /k python server.py

REM Give the server a moment to bind the port
timeout /t 2 /nobreak >nul

echo Opening http://127.0.0.1:8766/ in default browser...
start "" "http://127.0.0.1:8766/"

exit /b 0
