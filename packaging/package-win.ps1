#Requires -Version 5.1
param(
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Out = Join-Path $Root "release"
$Stage = Join-Path $Out "stage"
$PayloadDir = Join-Path $Stage "payload"
$LauncherDir = Join-Path $Root "packaging\launcher"
$AppZip = Join-Path $Out "app.zip"
$NodeVersion = "22.14.0"
$BundleDir = Join-Path $Out "bundle"

Write-Host "==> prepare output"
Remove-Item -Recurse -Force $Stage, $BundleDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $PayloadDir, $BundleDir, $Out | Out-Null

$standalone = Join-Path $Root ".next\standalone"
if (-not $SkipBuild -or -not (Test-Path $standalone)) {
  Write-Host "==> next standalone build"
  Push-Location $Root
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "next build failed" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "==> skip next build (reuse .next/standalone)"
}

if (-not (Test-Path $standalone)) { throw "missing .next/standalone" }

Write-Host "==> copy standalone/static/public/data"
Copy-Item -Recurse -Force (Join-Path $standalone "*") $PayloadDir
$staticDst = Join-Path $PayloadDir ".next\static"
New-Item -ItemType Directory -Force -Path $staticDst | Out-Null
Copy-Item -Recurse -Force (Join-Path $Root ".next\static\*") $staticDst
if (Test-Path (Join-Path $Root "public")) {
  $publicDst = Join-Path $PayloadDir "public"
  New-Item -ItemType Directory -Force -Path $publicDst | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Root "public\*") $publicDst
}
$dataDst = Join-Path $PayloadDir "data"
New-Item -ItemType Directory -Force -Path $dataDst | Out-Null
Get-ChildItem (Join-Path $Root "data") -File | Where-Object {
  $_.Name -notin @("local-settings.json", "poi_coords_failed.json", "poi_coords_failed.csv")
} | ForEach-Object { Copy-Item $_.FullName $dataDst -Force }

Write-Host "==> blank secrets for distribution"
@(
  "KTO_SERVICE_KEY=",
  "HUGGINGFACE_API_KEY=",
  "HUGGINGFACE_MODEL=Qwen/Qwen2.5-7B-Instruct",
  "HUGGINGFACE_TEMPERATURE=0.4",
  "TAVILY_API_KEY="
) | Set-Content -Encoding utf8 (Join-Path $PayloadDir ".env.local")

Write-Host "==> download Node $NodeVersion"
$nodeZip = Join-Path $Out "node-$NodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}
$nodeExtract = Join-Path $Out "node-extract"
Remove-Item -Recurse -Force $nodeExtract -ErrorAction SilentlyContinue
Expand-Archive -Path $nodeZip -DestinationPath $nodeExtract -Force
$nodeExe = Get-ChildItem -Path $nodeExtract -Recurse -Filter "node.exe" | Select-Object -First 1
if (-not $nodeExe) { throw "node.exe not found" }
Copy-Item $nodeExe.FullName (Join-Path $PayloadDir "node.exe") -Force

Write-Host "==> create app.zip"
if (Test-Path $AppZip) { Remove-Item $AppZip -Force }
Compress-Archive -Path (Join-Path $PayloadDir "*") -DestinationPath $AppZip -CompressionLevel Optimal

Write-Host "==> publish thin launcher"
Remove-Item -Recurse -Force (Join-Path $LauncherDir "bin"), (Join-Path $LauncherDir "obj") -ErrorAction SilentlyContinue
$publishDir = Join-Path $Out "publish"
Remove-Item -Recurse -Force $publishDir -ErrorAction SilentlyContinue
dotnet publish (Join-Path $LauncherDir "CarbonTourismLauncher.csproj") `
  -c Release -r win-x64 -o $publishDir --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:EnableCompressionInSingleFile=true
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

$launcher = Get-ChildItem $publishDir -Filter "CarbonTourismDashboard.exe" | Select-Object -First 1
if (-not $launcher) { throw "launcher exe not found" }

Copy-Item $launcher.FullName (Join-Path $BundleDir "CarbonTourismDashboard.exe") -Force
Copy-Item $AppZip (Join-Path $BundleDir "app.zip") -Force

Write-Host "==> build one-file SFX with 7-Zip"
$sfxDir = Join-Path $Out "7zextra"
$fullDir = Join-Path $Out "7zfull"
New-Item -ItemType Directory -Force -Path $sfxDir | Out-Null
$sevenZr = Join-Path $sfxDir "7zr.exe"
$sevenZa = Join-Path $sfxDir "7za.exe"
$sfxModule = Join-Path $fullDir "7z.sfx"
$sfxConfig = Join-Path $sfxDir "config.txt"
$oneExe = Join-Path $Out "CarbonTourismDashboard.exe"

if (-not (Test-Path $sevenZr)) {
  Invoke-WebRequest -Uri "https://www.7-zip.org/a/7zr.exe" -OutFile $sevenZr
}
if (-not (Test-Path $sevenZa)) {
  $extraZip = Join-Path $Out "7z2301-extra.7z"
  if (-not (Test-Path $extraZip)) {
    Invoke-WebRequest -Uri "https://www.7-zip.org/a/7z2301-extra.7z" -OutFile $extraZip
  }
  & $sevenZr x $extraZip "-o$sfxDir" -y | Out-Null
  if (-not (Test-Path $sevenZa)) {
    $found = Get-ChildItem $sfxDir -Recurse -Filter "7za.exe" | Select-Object -First 1
    if ($found) { Copy-Item $found.FullName $sevenZa -Force }
  }
}
if (-not (Test-Path $sfxModule)) {
  New-Item -ItemType Directory -Force -Path $fullDir | Out-Null
  $fullInstaller = Join-Path $Out "7z2409-x64.exe"
  if (-not (Test-Path $fullInstaller)) {
    Invoke-WebRequest -Uri "https://www.7-zip.org/a/7z2409-x64.exe" -OutFile $fullInstaller
  }
  & $sevenZr x $fullInstaller "-o$fullDir" -y | Out-Null
}

if ((Test-Path $sevenZa) -and (Test-Path $sfxModule)) {
  # ASCII config avoids BOM/encoding issues with copy /b
  @"
;!@Install@!UTF-8!
Title="Carbon Tourism Dashboard"
BeginPrompt="Install and run Carbon Tourism Dashboard?"
RunProgram="CarbonTourismDashboard.exe"
;!@InstallEnd@!
"@ | Set-Content -Encoding ascii $sfxConfig

  $archive7z = Join-Path $Out "bundle-payload.7z"
  if (Test-Path $archive7z) { Remove-Item $archive7z -Force }
  if (Test-Path $oneExe) { Remove-Item $oneExe -Force }
  & $sevenZa a -t7z -mx=7 $archive7z (Join-Path $BundleDir "*") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7za archive failed" }

  $cfgBytes = [System.IO.File]::ReadAllBytes($sfxConfig)
  $sfxBytes = [System.IO.File]::ReadAllBytes($sfxModule)
  $arcBytes = [System.IO.File]::ReadAllBytes($archive7z)
  $outStream = [System.IO.File]::Create($oneExe)
  $outStream.Write($sfxBytes, 0, $sfxBytes.Length)
  $outStream.Write($cfgBytes, 0, $cfgBytes.Length)
  $outStream.Write($arcBytes, 0, $arcBytes.Length)
  $outStream.Close()
  Write-Host "SFX OK: $oneExe"
} else {
  Write-Host "WARN: 7-Zip SFX tools missing - portable zip only"
}

$portableZip = Join-Path $Out "CarbonTourismDashboard-portable.zip"
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Compress-Archive -Path (Join-Path $BundleDir "*") -DestinationPath $portableZip -CompressionLevel Optimal

$readme = @"
탄소중립 관광 대시보드 — 배포 안내

받는 분께 전달할 파일 (둘 중 하나):
  1) CarbonTourismDashboard.exe          ← 더블클릭 한 번 (권장)
  2) CarbonTourismDashboard-portable.zip ← 압축 해제 후 exe 실행

동작:
  - 실행하면 브라우저가 열리고 대시보드가 표시됩니다.
  - HuggingFace / KTO / Tavily 키는 포함되어 있지 않습니다.
  - 우측 상단 [환경 설정]에서 키를 입력하세요.

재빌드: npm run package:win
"@
[System.IO.File]::WriteAllText((Join-Path $Out "README-DIST.txt"), $readme, (New-Object System.Text.UTF8Encoding $true))

Write-Host ""
Write-Host "DONE"
if (Test-Path $oneExe) {
  Write-Host ("one-file: {0:N1} MB  $oneExe" -f ((Get-Item $oneExe).Length / 1MB))
}
Write-Host ("portable: {0:N1} MB  $portableZip" -f ((Get-Item $portableZip).Length / 1MB))
Write-Host ("launcher: {0:N1} MB" -f ((Get-Item $launcher.FullName).Length / 1MB))
Write-Host ("app.zip:   {0:N1} MB" -f ((Get-Item $AppZip).Length / 1MB))
