@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Publicar el cotizador en Netlify
color 0F

echo.
echo  ============================================================
echo   PUBLICAR EL COTIZADOR
echo  ============================================================
echo.
echo   Carpeta: %CD%
echo.

REM ---------- 1. Comprobar que git existe ----------
git --version >nul 2>&1
if errorlevel 1 (
  echo   [X] No encontre git en esta computadora.
  echo.
  echo   Instalalo desde https://git-scm.com/download/win
  echo   y vuelve a dar doble clic aqui.
  echo.
  pause
  exit /b 1
)

REM ---------- 2. En que rama estamos ----------
for /f "tokens=*" %%r in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set RAMA=%%r
echo   Rama actual: %RAMA%
echo.

REM ---------- 3. Que cambio ----------
echo  ------------------------------------------------------------
echo   Archivos que se van a subir:
echo  ------------------------------------------------------------
git status --short
echo.

REM ---------- 4. Guardar los cambios ----------
echo  ------------------------------------------------------------
echo   Guardando los cambios...
echo  ------------------------------------------------------------
git add -A
git commit -m "Makers Lab dentro del sitio, varias empresas por correo y puerta de dueno"
if errorlevel 1 (
  echo.
  echo   [i] No habia nada nuevo que guardar. Seguimos: puede que
  echo       el commit ya se hubiera hecho antes y solo falte subirlo.
)
echo.

REM ---------- 5. Subir a main, que es de donde publica Netlify ----------
echo  ------------------------------------------------------------
echo   Subiendo a GitHub (rama main)...
echo  ------------------------------------------------------------
git push origin HEAD:main
if errorlevel 1 goto fallo

echo.
echo  ============================================================
echo   LISTO. Ya subio.
echo  ============================================================
echo.
echo   Netlify arranca solo en unos segundos. Entra a tu panel de
echo   Netlify y espera a que el despliegue quede en verde.
echo.
echo   Cuando termine, faltan dos cosas en Supabase:
echo     1) correr  sql\05-rescate.sql
echo     2) correr  sql\06-superadmin.sql
echo.
pause
exit /b 0

:fallo
echo.
echo  ============================================================
echo   NO SE PUDO SUBIR
echo  ============================================================
echo.
echo   Lee el mensaje de arriba. Los dos casos mas comunes:
echo.
echo   - Te pide usuario y contrasena:
echo       cierra esta ventana, abre otra vez este archivo pero
echo       antes corre  gh auth login  en una terminal.
echo.
echo   - Dice "rejected" o "non-fast-forward":
echo       alguien mas subio algo a main. Mandale a Claude una
echo       captura de esta ventana y te digo que hacer.
echo.
echo   Nada se perdio: tus cambios ya quedaron guardados en git.
echo.
pause
exit /b 1
