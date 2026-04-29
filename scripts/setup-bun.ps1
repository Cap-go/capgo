$ErrorActionPreference = 'Stop'

Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
"$env:USERPROFILE\.bun\bin" | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
$env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"

bun --version
