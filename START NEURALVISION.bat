@echo off
title NEURALVISION Launcher
color 0B
echo.
echo  NEURALVISION // Real-Time Edge Computer Vision
echo  Build 0.1
echo  ================================================
echo.
cd /d "%~dp0"

echo  [1/3] Checking Python dependencies...
python -m pip install -r backend\requirements.txt --quiet --no-warn-script-location
echo  [1/3] OK

echo  [2/3] Starting FastAPI backend on port 8000...
start "NEURALVISION Backend" cmd /k "title NEURALVISION Backend && cd /d ""%~dp0backend"" && python main.py"
timeout /t 3 /nobreak >nul

echo  [3/3] Starting frontend server on port 5500...
start "NEURALVISION Frontend" cmd /k "title NEURALVISION Frontend && cd /d ""%~dp0frontend"" && python -m http.server 5500"
timeout /t 2 /nobreak >nul

echo  Opening dashboard...
start "" "http://localhost:5500"

echo.
echo  ================================================
echo   Dashboard  http://localhost:5500
echo   API Docs   http://localhost:8000/docs
echo  ================================================
echo.
pause
