@echo off
REM PlantUMLAssist launcher (Windows, no persistent console).
REM Uses pythonw so the console window closes immediately after launch.

cd /d "%~dp0"

where pythonw >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pythonw not found in PATH. Install Python 3 and retry.
  pause
  exit /b 1
)

REM Launch the server detached. pythonw has no console so nothing appears.
start "" pythonw server.py

REM Give the server a moment to bind the port
timeout /t 2 /nobreak >nul

REM Open the app in the default browser
start "" "http://127.0.0.1:8766/"

exit /b 0
