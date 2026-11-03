@echo off
setlocal
set "NUVOOR_COBROS_EXIT=0"
cd /d "%~dp0"

rem Consola oficial portable: no depende de Node, npm, npx ni Docker.
set "NUVOOR_CLI_DIR=%~dp0tmp\stripe\cli"
set "NUVOOR_CLI=%NUVOOR_CLI_DIR%\supabase.exe"
if exist "%NUVOOR_CLI%" goto consola_lista

echo Descargando la consola oficial de Supabase 3.0.0...
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dir=$env:NUVOOR_CLI_DIR; New-Item -ItemType Directory -Path $dir -Force | Out-Null; $zip=Join-Path $dir 'supabase.zip'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/supabase/cli/releases/download/v3.0.0/supabase_3.0.0_windows_amd64.zip' -OutFile $zip; if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne '1a52dc682cd60e52170da0860ff3001d7cc06a507dd80843fbaef0a29919b141') { throw 'La descarga no paso la verificacion SHA256; no se ejecutara.' }; Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force"
if errorlevel 1 goto error

:consola_lista
if /i "%~1"=="--comprobar" goto comprobar

echo Nuvoor: inicio de sesion y subida de las tres funciones de cobro.
echo Este archivo no configura ni muestra llaves o secretos.
echo Destino: proyecto vgobhszuziyrrgfysenk. No ejecuta SQL.
"%NUVOOR_CLI%" login
if errorlevel 1 goto error

rem CLI 3 usa --remote para elegir proyecto sin enlazar ni pedir clave de BD.
"%NUVOOR_CLI%" functions deploy crear-pago portal-suscripcion webhook-stripe --remote=vgobhszuziyrrgfysenk --no-verify-jwt --use-api
if errorlevel 1 goto error

echo.
echo Listo: se subieron crear-pago, portal-suscripcion y webhook-stripe.
echo Agrega STRIPE_LLAVE, SITIO_URL, DATOS_BANCO y STRIPE_WEBHOOK_SECRETO en los Secrets de Supabase.
goto fin

:comprobar
echo Comprobacion local: NO inicia sesion ni sube funciones.
"%NUVOOR_CLI%" --version
if errorlevel 1 goto error
echo Consola lista para usar con doble clic.
goto fin

:error
set "NUVOOR_COBROS_EXIT=1"
echo.
echo Algo fallo. Copia el mensaje de arriba para revisarlo; no pegues llaves aqui.

:fin
echo.
pause
endlocal & exit /b %NUVOOR_COBROS_EXIT%
