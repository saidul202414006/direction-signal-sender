@echo off
title Zone Detection Monitor - Windows Application
cd /d "%~dp0"
echo ========================================================
echo  Zone Detection Monitor - ESP32 CSI Signal Visualizer
echo ========================================================
echo.
if not exist node_modules (
    echo [Setup] Installing required dependencies...
    call npm install
)

echo [Launch] Starting Zone Detection Application...
call npm start
pause
