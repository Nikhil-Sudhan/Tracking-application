param(
  [ValidateSet('employee','admin')][string]$Variant = 'employee',
  [string]$ToolRoot = 'E:\grosuite-build',
  [string]$NodeDirectory = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$env:PATH = "$NodeDirectory;$env:PATH"
$env:ANDROID_HOME = Join-Path $ToolRoot 'android-sdk'
$env:GRADLE_USER_HOME = Join-Path $ToolRoot 'gradle'
$env:TEMP = Join-Path $ToolRoot 'tmp'
$env:TMP = $env:TEMP
$env:NODE_ENV = 'production'
$env:APP_VARIANT = $Variant
$env:JAVA_TOOL_OPTIONS = "-Djava.net.preferIPv4Stack=true -Djdk.net.unixdomain.tmpdir=C:\Windows\Temp -Djava.io.tmpdir=$($env:TEMP)"
$signing = Join-Path $ToolRoot 'signing'
$output = Join-Path $project 'outputs\android'
New-Item -ItemType Directory -Force $output,$env:TEMP | Out-Null
if (!(Test-Path "$signing\grosuite-field.p12")) { throw "Signing key missing at $signing. Restore the original key to preserve app updates." }
Push-Location (Join-Path $project 'mobile')
try {
  & node node_modules/typescript/bin/tsc --noEmit
  if ($LASTEXITCODE) { throw 'Mobile typecheck failed.' }
  # Release Windows locks before Expo regenerates a different app variant.
  $gradleLauncher = Get-ChildItem (Join-Path $env:GRADLE_USER_HOME 'wrapper\dists\gradle-9.3.1-bin') -Filter gradle.bat -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($gradleLauncher) { & $gradleLauncher.FullName --stop }
  # Sync permissions and versions from app.json even when native files exist.
  & node node_modules/expo/bin/cli prebuild --platform android --no-install
  if ($LASTEXITCODE) { throw 'Android prebuild failed.' }
  Push-Location android
  try {
    & .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --console=plain --max-workers=4 --no-daemon
    if ($LASTEXITCODE) { throw 'Android build failed.' }
  } finally { Pop-Location }
  $appVersion = (Get-Content app.json -Raw | ConvertFrom-Json).expo.version
  $appLabel = if ($Variant -eq 'admin') { 'Admin' } else { 'Field' }
  $apk = Join-Path $output "GroSuite-$appLabel-$appVersion.apk"
  $signer = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat'
  & $signer sign --ks "$signing\grosuite-field.p12" --ks-key-alias grosuite-field --ks-pass "file:$signing\keystore-password.txt" --out $apk 'android\app\build\outputs\apk\release\app-release.apk'
  if ($LASTEXITCODE) { throw 'APK signing failed.' }
  & $signer verify --verbose --print-certs $apk
  if ($LASTEXITCODE) { throw 'APK signature verification failed.' }
  "$((Get-FileHash $apk -Algorithm SHA256).Hash.ToLower())  $(Split-Path $apk -Leaf)" | Set-Content "$apk.sha256"
  Write-Host "APK ready: $apk"
} finally { Pop-Location }
