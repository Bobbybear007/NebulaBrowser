@echo off
echo Starting Nebula Browser with GPU diagnostics...
echo.

REM Check if running with administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Warning: Not running as administrator. Some GPU features may not work.
    echo Consider running as administrator if you encounter GPU issues.
    echo.
)

REM Set environment variables for better GPU support
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_LOG_FILE=gpu-debug.log

REM Alternative GPU configurations
echo Choose GPU configuration:
echo 1. Default (recommended)
echo 2. Force GPU acceleration
echo 3. Disable GPU (software rendering)
echo 4. Debug mode with verbose logging
echo.
set /p choice="Enter choice (1-4): "

if "%choice%"=="1" (
    echo Starting with default GPU configuration...
    npm start
) else if "%choice%"=="2" (
    echo Forcing GPU acceleration...
    set ELECTRON_FORCE_HARDWARE_ACCELERATION=1
    npm start
) else if "%choice%"=="3" (
    echo Using software rendering...
    set ELECTRON_DISABLE_GPU=1
    npm start -- --disable-gpu
) else if "%choice%"=="4" (
    echo Starting in debug mode...
    set ELECTRON_ENABLE_STACK_DUMPING=1
    npm start -- --enable-logging --log-level=0 --vmodule=gpu*=3
) else (
    echo Invalid choice, using default...
    npm start
)

echo.
echo Browser closed. Check gpu-debug.log for GPU-related messages.
pause
