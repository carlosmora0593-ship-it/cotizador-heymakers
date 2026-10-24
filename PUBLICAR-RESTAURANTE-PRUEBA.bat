@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Publicar prueba de Makers Restaurant
color 0F

echo.
echo  ============================================================
echo   PREPARAR PRUEBA DE MAKERS RESTAURANT
echo  ============================================================
echo.
echo   Primero se genera la version mas reciente de la app.
echo   Despues se abriran la carpeta lista para publicar y Netlify Drop.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-app-restaurante.ps1"
if errorlevel 1 (
  echo.
  echo   No se pudo preparar la app. No se abrio Netlify.
  pause
  exit /b 1
)

echo.
echo   Inicia sesion en Netlify con la cuenta que administrara la prueba.
echo   Arrastra la carpeta public\restaurante a la zona de publicacion.
echo   Al terminar, Netlify te dara el enlace HTTPS para instalarla.
echo.

start "" "https://app.netlify.com/drop"
start "" explorer.exe "%~dp0public\restaurante"
pause
endlocal
