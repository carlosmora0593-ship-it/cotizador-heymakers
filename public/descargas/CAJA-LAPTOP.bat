@echo off
setlocal
title Nuvoor Caja
echo.
echo Instala primero la impresora termica en Windows.
echo En Configuracion de Windows, marcala como impresora predeterminada.
echo El acceso Nuvoor Caja imprimira directamente en esa impresora.
echo.
set "NUVOOR_LAUNCHER=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$content = [IO.File]::ReadAllText($env:NUVOOR_LAUNCHER); $script = $content.Substring($content.LastIndexOf('# NUVOOR POWERSHELL') + 19); & ([scriptblock]::Create($script))"
if errorlevel 1 (
  echo No se pudo crear el acceso. Revisa el mensaje anterior.
) else (
  echo Acceso Nuvoor Caja creado en el escritorio.
  echo Abre ese acceso e inicia sesion con tu cuenta.
  echo En Ajustes - Impresoras, elige Impresora de esta computadora.
)
echo.
pause
exit /b
# NUVOOR POWERSHELL
$ErrorActionPreference = 'Stop'
$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$browser = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw 'Instala Google Chrome o Microsoft Edge para crear el acceso.' }
$profile = Join-Path $env:LOCALAPPDATA 'NuvoorCaja'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Nuvoor Caja.lnk'))
$shortcut.TargetPath = $browser
$shortcut.Arguments = '--kiosk-printing --app=https://app.nuvoor.mx/restaurante/ --user-data-dir="' + $profile + '"'
$shortcut.Description = 'Nuvoor Caja con impresion en la impresora predeterminada'
$shortcut.Save()
