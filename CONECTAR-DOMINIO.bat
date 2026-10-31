@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Conectar app.nuvoor.mx
color 0F

set "REPO=carlosmora0593-ship-it/cotizador-heymakers"
set "DOMINIO=app.nuvoor.mx"

echo.
echo  ============================================================
echo   CONECTAR %DOMINIO%
echo  ============================================================
echo.
echo   Este archivo se puede correr las veces que quieras. Cada vez
echo   revisa en que paso vas y sigue desde ahi.
echo.

gh --version >nul 2>&1
if errorlevel 1 goto singh
gh auth status >nul 2>&1
if errorlevel 1 goto sinsesion

echo  ------------------------------------------------------------
echo   1. Que GoDaddy ya apunte %DOMINIO% a GitHub
echo  ------------------------------------------------------------
nslookup -type=CNAME %DOMINIO% 8.8.8.8 2>nul | find /i "carlosmora0593-ship-it.github.io" >nul
if errorlevel 1 goto sindns
echo   [OK] GoDaddy ya apunta %DOMINIO% a GitHub.
echo.

echo  ------------------------------------------------------------
echo   2. Poner el dominio en GitHub Pages
echo  ------------------------------------------------------------
gh api -X PUT "repos/%REPO%/pages" -f cname=%DOMINIO% >nul
if errorlevel 1 goto fallo
echo   [OK] GitHub ya sabe que el sitio vive en %DOMINIO%.
echo.

echo  ------------------------------------------------------------
echo   3. El candado de seguridad HTTPS
echo  ------------------------------------------------------------
gh api -X PUT "repos/%REPO%/pages" -F https_enforced=true >nul 2>&1
if errorlevel 1 goto sincertificado
echo   [OK] Candado activado.
echo.
echo  ============================================================
echo   LISTO
echo  ============================================================
echo.
echo   Tu sistema ya abre en  https://%DOMINIO%
echo.
echo   Falta lo de Supabase. Esta en la guia que te dejo Claude.
echo   Avisale a Claude para que lo revise en el sitio de verdad.
echo.
pause
exit /b 0

:sindns
echo   [ESPERA] Todavia no veo el registro de GoDaddy.
echo.
echo   En GoDaddy, en el DNS de nuvoor.mx, tiene que haber un registro:
echo      Tipo:   CNAME
echo      Nombre: app
echo      Valor:  carlosmora0593-ship-it.github.io
echo.
echo   Si ya lo pusiste, GoDaddy tarda de 10 minutos a una hora en
echo   soltarlo. Vuelve a darle doble clic a este archivo en un rato.
echo.
pause
exit /b 1

:sincertificado
echo   [ESPERA] El dominio ya quedo puesto, pero GitHub todavia esta
echo   generando el certificado del candado. Casi siempre son minutos;
echo   a veces hasta 24 horas.
echo.
echo   Vuelve a darle doble clic mas tarde: los pasos 1 y 2 se brincan
echo   solos y nada mas intenta el candado otra vez.
echo.
echo   Mientras tanto el sitio ya abre en  http://%DOMINIO%
echo.
pause
exit /b 0

:singh
echo   [X] No encontre la herramienta gh de GitHub. Es la misma que usa
echo       PUBLICAR.bat. Mandale a Claude una captura de esta ventana.
echo.
pause
exit /b 1

:sinsesion
echo   [X] gh no tiene tu sesion de GitHub abierta.
echo       Escribe  gh auth login  en una ventana de comandos, entra
echo       con tu cuenta, y vuelve a darle doble clic a este archivo.
echo.
pause
exit /b 1

:fallo
echo.
echo   [X] GitHub no acepto el cambio. Mandale a Claude una captura
echo       de esta ventana.
echo.
pause
exit /b 1
