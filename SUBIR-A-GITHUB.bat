@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Subir a GitHub
color 0F

echo.
echo  ============================================================
echo   SUBIR A GITHUB
echo  ============================================================
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo   [X] No encontre git. Instalalo desde https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo  ------------------------------------------------------------
echo   1. Guardando lo que cambio aqui
echo  ------------------------------------------------------------
git add -A
git commit -m "Quitar el correo de los archivos SQL publicos"
if errorlevel 1 echo   [i] No habia nada nuevo. Seguimos.
echo.

echo  ------------------------------------------------------------
echo   2. Trayendo lo que hay en GitHub
echo  ------------------------------------------------------------
REM Esto es lo que faltaba: GitHub tiene el flujo de publicacion que se
REM creo desde la pagina web, y sin traerlo primero el push se rechaza.
git fetch origin main
if errorlevel 1 goto fallo

git rebase origin/main
if errorlevel 1 (
  echo.
  echo   [!] Hubo un choque al juntar los cambios. Lo deshago para no
  echo       dejar nada a medias.
  git rebase --abort
  echo.
  echo   Mandale a Claude una captura de esta ventana.
  echo.
  pause
  exit /b 1
)
echo.

echo  ------------------------------------------------------------
echo   3. Subiendo
echo  ------------------------------------------------------------
git push origin HEAD:main
if errorlevel 1 goto fallo

echo.
echo  ============================================================
echo   LISTO. Ya subio.
echo  ============================================================
echo.
echo   En un minuto GitHub vuelve a publicar el sitio solo.
echo.
pause
exit /b 0

:fallo
echo.
echo  ============================================================
echo   NO SE PUDO
echo  ============================================================
echo.
echo   Si te pide usuario y contrasena, corre  gh auth login  primero.
echo   Si dice otra cosa, mandale a Claude una captura de esta ventana.
echo.
echo   Nada se perdio: tus cambios estan guardados en git.
echo.
pause
exit /b 1
