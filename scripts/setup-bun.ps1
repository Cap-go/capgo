$ErrorActionPreference = 'Stop'

$BunVersion = '1.3.11'
$AssetName = 'bun-windows-x64.zip'
$AssetSha256 = '066f8694f8b7d8df592452746d18f01710d4053e93030922dbc6e8c34a8c4b9f'

$TempDir = Join-Path $env:RUNNER_TEMP "bun-$BunVersion"
$ArchivePath = Join-Path $TempDir $AssetName
$ExtractPath = Join-Path $TempDir 'extract'
$InstallDir = Join-Path $env:USERPROFILE '.bun\bin'

Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -Path $TempDir -ItemType Directory -Force | Out-Null

$AssetUrl = "https://github.com/oven-sh/bun/releases/download/bun-v$BunVersion/$AssetName"
Invoke-WebRequest -Uri $AssetUrl -OutFile $ArchivePath

$ActualSha256 = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualSha256 -ne $AssetSha256) {
  throw "Checksum mismatch for $AssetName. Expected $AssetSha256, got $ActualSha256."
}

Expand-Archive -Path $ArchivePath -DestinationPath $ExtractPath -Force

$BunExecutable = Get-ChildItem -Path $ExtractPath -Filter 'bun.exe' -File -Recurse | Select-Object -First 1
if (-not $BunExecutable) {
  throw "bun.exe not found in $AssetName."
}

New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
Copy-Item -Path $BunExecutable.FullName -Destination (Join-Path $InstallDir 'bun.exe') -Force
Copy-Item -Path $BunExecutable.FullName -Destination (Join-Path $InstallDir 'bunx.exe') -Force

"$env:USERPROFILE\.bun\bin" | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
$env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"

bun --version
