@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-app-restaurante.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo preparar la app.
  pause
  exit /b 1
)
echo.
echo Listo. La app esta en public\restaurante\
pause
