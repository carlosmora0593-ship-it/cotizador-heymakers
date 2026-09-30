@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Publicar Hey Makers
color 0F

echo.
echo  ============================================================
echo   PUBLICAR
echo  ============================================================
echo.
echo   Un solo empujon publica los dos lados:
echo     - GitHub Pages  (el sitio de siempre)
echo     - Netlify       (el mismo sitio, pero con servidor)
echo.
echo   Los dos leen de GitHub, asi que subir una vez actualiza ambos.
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo   [X] No encontre git. Instalalo desde https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo  ------------------------------------------------------------
echo   1. Esto es lo que cambio
echo  ------------------------------------------------------------
git status --short
echo.

REM  El mensaje del commit es lo unico que se teclea. Si lo dejas vacio
REM  se pone la fecha y la hora, que para el dia a dia alcanza.
set "MENSAJE="
set /p MENSAJE="  Que cambiaste? (Enter para poner la fecha): "
if "%MENSAJE%"=="" set "MENSAJE=Cambios del %date% %time:~0,5%"

echo.
echo  ------------------------------------------------------------
echo   2. Guardando
echo  ------------------------------------------------------------
git add -A
git commit -m "%MENSAJE%"
if errorlevel 1 echo   [i] No habia nada nuevo que guardar. Seguimos.
echo.

echo  ------------------------------------------------------------
echo   3. Trayendo lo que hay en GitHub
echo  ------------------------------------------------------------
REM  Sin traer primero, el push se rechaza cuando algo se creo desde la
REM  pagina web de GitHub (como el flujo de publicacion).
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
echo   4. Subiendo
echo  ------------------------------------------------------------
git push origin HEAD:main
if errorlevel 1 goto fallo

echo.
echo  ============================================================
echo   LISTO
echo  ============================================================
echo.
echo   En uno o dos minutos los dos sitios se actualizan solos.
echo.
echo   Si abriste el cotizador antes de publicar, no hace falta que
echo   cierres nada: la pagina se da cuenta sola de que hay version
echo   nueva y se vuelve a cargar.
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
