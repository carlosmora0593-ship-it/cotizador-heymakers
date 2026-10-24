param(
  [string]$GradleCommand = "gradle",
  [string]$SigningPackageZip = "C:\Users\hp\Downloads\Makers Rest - Google Play package (1).zip"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$gradleCommand = Get-Command $GradleCommand -ErrorAction SilentlyContinue
$gradlePath = if ($gradleCommand) { if ($gradleCommand.Path) { $gradleCommand.Path } else { $gradleCommand.Source } }
if (-not $gradlePath) {
  $gradleCache = Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.13-bin"
  if (Test-Path -LiteralPath $gradleCache) {
    $cachedGradle = Get-ChildItem -LiteralPath $gradleCache -Filter "gradle.bat" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cachedGradle) { $gradlePath = $cachedGradle.FullName }
  }
}
if (-not $gradlePath) {
  throw "No encuentro Gradle 8.13. Instálalo o indica la ruta a gradle.bat con -GradleCommand."
}
$studioJavaHome = $null
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  $javaCandidates = @(
    (Join-Path $env:ProgramFiles "Android\Android Studio\jbr"),
    (Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr")
  )
  $studioJavaHome = $javaCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "bin\java.exe") } | Select-Object -First 1
  if (-not $studioJavaHome) {
    throw "No encuentro Java 17. Instala Android Studio o configura JAVA_HOME."
  }
}
$sdkPath = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
if (-not $sdkPath) { $sdkPath = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
if (-not (Test-Path -LiteralPath $sdkPath)) {
  throw "No encuentro Android SDK. Instala Android SDK Platform 35 desde Android Studio."
}
if (-not (Test-Path -LiteralPath $SigningPackageZip)) {
  throw "No encuentro el paquete de firma de PWABuilder. Indica el ZIP que contiene signing.keystore y signing-key-info.txt."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempDir = Join-Path $tempRoot ("makers-android-signing-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$oldEnv = @{
  ANDROID_HOME = $env:ANDROID_HOME
  JAVA_HOME = $env:JAVA_HOME
  PATH = $env:PATH
  MAKERS_KEYSTORE_PATH = $env:MAKERS_KEYSTORE_PATH
  MAKERS_KEYSTORE_PASSWORD = $env:MAKERS_KEYSTORE_PASSWORD
  MAKERS_KEY_ALIAS = $env:MAKERS_KEY_ALIAS
  MAKERS_KEY_PASSWORD = $env:MAKERS_KEY_PASSWORD
}

try {
  if ($studioJavaHome) {
    $env:JAVA_HOME = $studioJavaHome
    $env:PATH = (Join-Path $studioJavaHome "bin") + ";" + $env:PATH
  }
  $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $SigningPackageZip).Path)
  try {
    $keyEntry = $archive.GetEntry("signing.keystore")
    $infoEntry = $archive.GetEntry("signing-key-info.txt")
    if (-not $keyEntry -or -not $infoEntry) { throw "El ZIP no contiene los archivos de firma esperados." }
    $keyPath = Join-Path $tempDir "signing.keystore"
    $inputStream = $keyEntry.Open()
    $outputStream = [IO.File]::Create($keyPath)
    try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    $reader = [IO.StreamReader]::new($infoEntry.Open())
    try { $signingInfo = $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally { $archive.Dispose() }

  function Get-SigningValue([string]$label) {
    $pattern = "(?m)^\s*" + [regex]::Escape($label) + "\s*:\s*(.*?)\s*$"
    $match = [regex]::Match($signingInfo, $pattern)
    if (-not $match.Success) { throw "Falta el dato de firma '$label' en el ZIP de PWABuilder." }
    return $match.Groups[1].Value.Trim()
  }

  $env:ANDROID_HOME = $sdkPath
  $env:MAKERS_KEYSTORE_PATH = $keyPath
  $env:MAKERS_KEYSTORE_PASSWORD = Get-SigningValue "Key store password"
  $env:MAKERS_KEY_ALIAS = Get-SigningValue "Key alias"
  $env:MAKERS_KEY_PASSWORD = Get-SigningValue "Key password"

  $pagePath = Join-Path (Split-Path $projectRoot -Parent) "PRUEBA-restaurant.html"
  $assetPath = Join-Path $projectRoot "app\src\main\assets\www\index.html"
  if (-not (Test-Path -LiteralPath $pagePath)) { throw "No encuentro PRUEBA-restaurant.html para incluirlo en el APK." }
  New-Item -ItemType Directory -Path (Split-Path $assetPath -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $pagePath -Destination $assetPath -Force

  Push-Location $projectRoot
  try {
    & $gradlePath --no-daemon :app:assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Gradle terminó con código $LASTEXITCODE." }
  } finally { Pop-Location }

  $builtApk = Join-Path $projectRoot "app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path -LiteralPath $builtApk)) { throw "Gradle terminó, pero no encuentro el APK firmado esperado." }
  $releaseFolder = Join-Path (Split-Path $projectRoot -Parent) "android-release"
  New-Item -ItemType Directory -Path $releaseFolder -Force | Out-Null
  Copy-Item -LiteralPath $builtApk -Destination (Join-Path $releaseFolder "Makers-Restaurant.apk") -Force
  $sourceHash = (Get-FileHash -LiteralPath $pagePath -Algorithm SHA256).Hash
  [IO.File]::WriteAllText((Join-Path $releaseFolder "Makers-Restaurant.native-source.sha256"), $sourceHash)

  $preparer = Join-Path (Split-Path $projectRoot -Parent) "preparar-app-restaurante.ps1"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preparer
  if ($LASTEXITCODE -ne 0) { throw "El APK se creó, pero no se pudo preparar la carpeta web de publicación." }
  Write-Host "APK firmado listo: android-release/Makers-Restaurant.apk"
  Write-Host "La carpeta public/restaurante ya contiene la versión nativa para publicar."
} finally {
  foreach ($name in $oldEnv.Keys) {
    if ($null -eq $oldEnv[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    else { Set-Item -LiteralPath "Env:$name" -Value $oldEnv[$name] }
  }
  $resolvedTemp = [IO.Path]::GetFullPath($tempDir)
  if ($resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
