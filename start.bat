@echo off
SETLOCAL ENABLEDELAYEDEXPANSION
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo +------------------------------------------+
echo ^|     Discord AutoTool Launcher          ^|
echo ^|     Version 1.0.0                      ^|
echo +------------------------------------------+
echo.

where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    color 4F
    echo [ERROR] Node.js n'est pas installe sur cette machine
    echo.
    echo Telechargez Node.js depuis: https://nodejs.org/
    echo Apres installation, relancez ce fichier.
    echo.
    color
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js detecte: %NODE_VERSION%

where npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    color 4F
    echo [ERROR] npm n'est pas disponible
    color
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm detecte: %NPM_VERSION%

IF NOT EXIST "node_modules" (
    echo.
    echo [INFO] Installation des dependances ^(1-2 min^)...
    call npm install
    IF %ERRORLEVEL% NEQ 0 (
        color 4F
        echo [ERROR] Erreur lors de l'installation des dependances
        color
        pause
        exit /b 1
    )
)

IF NOT EXIST "config" (
    mkdir config
    echo [INFO] Dossier config cree
)

echo.
echo [INFO] Lancement de Discord AutoTool...
echo.
title Discord AutoTool
call npm start

if errorlevel 1 (
    color 4F
    echo.
    echo [ERROR] Erreur au demarrage
    color
)

pause
