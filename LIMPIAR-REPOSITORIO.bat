@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Limpiar el repositorio
color 0F

echo.
echo  ============================================================
echo   LIMPIAR EL REPOSITORIO
echo  ============================================================
echo.
echo   Tres cosas, y ninguna borra trabajo tuyo:
echo.
echo     1. Saca makers-fuentes.tar.gz del repositorio publico.
echo        Ese paquete lleva tu correo escrito adentro, en dos
echo        archivos. El archivo SE QUEDA en tu carpeta: solo deja
echo        de subir a GitHub.
echo.
echo     2. Saca REVISAR-11-probar-como-dueno.sql, que seguia
echo        registrado aunque ya esta en .gitignore. Poner algo en
echo        .gitignore no lo desregistra si ya estaba dentro.
echo.
echo     3. Borra public\PRUEBA-commit.html, que era una prueba de
echo        184 bytes y ya no sirve.
echo.
pause

echo.
echo  --- 1 y 2: desregistrar -------------------------------------
git rm --cached "makers-fuentes.tar.gz" 2>nul
if errorlevel 1 echo   [i] makers-fuentes.tar.gz ya no estaba registrado.
git rm --cached "REVISAR-11-probar-como-dueno.sql" 2>nul
if errorlevel 1 echo   [i] REVISAR-11 ya no estaba registrado.

findstr /c:"makers-fuentes.tar.gz" .gitignore >nul 2>&1
if errorlevel 1 (
  echo.>> .gitignore
  echo # El paquete de fuentes lleva tu correo adentro. Se queda en la>> .gitignore
  echo # carpeta, pero no sube: el repositorio es publico.>> .gitignore
  echo makers-fuentes.tar.gz>> .gitignore
  echo *.tar.gz>> .gitignore
  echo   [+] .gitignore actualizado.
) else (
  echo   [i] .gitignore ya lo tenia.
)

echo.
echo  --- 3: borrar la prueba -------------------------------------
if exist "public\PRUEBA-commit.html" (
  del "public\PRUEBA-commit.html"
  echo   [+] public\PRUEBA-commit.html borrado.
) else (
  echo   [i] No estaba.
)

echo.
echo  ============================================================
echo   LISTO
echo  ============================================================
echo.
echo   Falta publicarlo: corre PUBLICAR.bat.
echo.
echo   Una cosa honesta: esto saca el archivo de la version de hoy,
echo   pero tu correo sigue en el historial de git, en los commits
echo   viejos. Borrarlo de ahi se puede, y reescribe el historial
echo   completo del repositorio. Si quieres, lo vemos aparte.
echo.
pause
