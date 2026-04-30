@echo off
SETLOCAL ENABLEDELAYEDEXPANSION
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo +--------------------------------------------+
echo ^|  Discord AutoTool - Build Executable      ^|
echo ^|  Requis: npm install -g pkg               ^|
echo +--------------------------------------------+
echo.

npm list -g pkg >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [INFO] Installation de pkg...
    call npm install -g pkg
)

echo.
echo [INFO] Construction en cours...
echo [INFO] Cela peut prendre quelques minutes...
echo.

call pkg . --targets latest-win --output discord-autotool.exe

if errorlevel 1 (
    echo.
    echo [ERROR] Erreur lors de la compilation
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Executable cree: discord-autotool.exe
echo.
echo [OK] Vous pouvez maintenant lancer: discord-autotool.exe
echo.
pause
