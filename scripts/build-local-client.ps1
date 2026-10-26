param(
  [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Downloads'),
  [string]$PackageName = 'MainProject-Local-Client'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$buildDate = Get-Date -Format 'yyyy-MM-dd'
$stagingRoot = Join-Path $env:TEMP "$PackageName-build"
$packageRoot = Join-Path $stagingRoot $PackageName
$zipPath = Join-Path $OutputDirectory "$PackageName-v$packageVersion-$buildDate.zip"

if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'run-link-package\node') -Force | Out-Null

Copy-Item (Join-Path $projectRoot 'public') $packageRoot -Recurse
Copy-Item (Join-Path $projectRoot 'mobile') $packageRoot -Recurse
Copy-Item (Join-Path $projectRoot 'local-client.js') $packageRoot
Copy-Item (Join-Path $projectRoot 'run-link-package\RUN_PROGRAM.bat') (Join-Path $packageRoot 'run-link-package')
Copy-Item (Join-Path $projectRoot 'run-link-package\RUN_LOCAL_PROGRAM.bat') (Join-Path $packageRoot 'run-link-package')
Copy-Item (Join-Path $projectRoot 'run-link-package\RUN_PROGRAM.url') (Join-Path $packageRoot 'run-link-package')
Copy-Item (Join-Path $projectRoot 'run-link-package\README.txt') (Join-Path $packageRoot 'run-link-package')
Copy-Item (Join-Path $projectRoot 'run-link-package\package.local-client.json') (Join-Path $packageRoot 'package.json')
Copy-Item (Join-Path $projectRoot 'run-link-package\RUN_PACKAGE.bat') (Join-Path $packageRoot 'RUN_PROGRAM.bat')
Copy-Item (Join-Path $projectRoot 'run-link-package\README.txt') (Join-Path $packageRoot 'README.txt')

$nodeCommand = Get-Command node -ErrorAction Stop
Copy-Item $nodeCommand.Source (Join-Path $packageRoot 'run-link-package\node\node.exe')

Push-Location $packageRoot
try {
  & npm install --omit=dev --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
Compress-Archive -Path $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output $zipPath
