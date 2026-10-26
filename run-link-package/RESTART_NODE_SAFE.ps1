$ErrorActionPreference = 'Stop'

if ($env:COMPUTERNAME -ne 'PC-SERVER') {
  throw 'This script must run directly on PC-SERVER.'
}

$projectRoot = 'G:\Database\MainProject.Api'
$nodePath = Join-Path $projectRoot 'run-link-package\node\node.exe'
$lockPath = 'G:\Database\database.db.api-lock'

if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'server.js'))) {
  throw 'The live server.js file was not found.'
}
if (!(Test-Path -LiteralPath $nodePath)) {
  throw 'The portable Node executable was not found.'
}

$listeningProcessIds = @()
$netstatLines = & "$env:SystemRoot\System32\netstat.exe" -ano -p tcp
foreach ($netstatLine in $netstatLines) {
  if ($netstatLine -match '^\s*TCP\s+\S+:5000\s+\S+\s+LISTENING\s+(\d+)\s*$') {
    $listeningProcessIds += [int]$matches[1]
  }
}

foreach ($nodeProcessId in ($listeningProcessIds | Select-Object -Unique)) {
  $serverProcess = Get-WmiObject Win32_Process -Filter ('ProcessId = ' + $nodeProcessId)
  if (
    $serverProcess -and
    $serverProcess.Name -eq 'node.exe' -and
    $serverProcess.CommandLine -match 'server\.js'
  ) {
    Write-Host ('Stopping server.js PID ' + $nodeProcessId)
    Stop-Process -Id $nodeProcessId -Force
  } else {
    throw ('Port 5000 is occupied by an unexpected listening process. PID: ' + $nodeProcessId)
  }
}

Start-Sleep -Seconds 2

if (Test-Path -LiteralPath $lockPath) {
  Remove-Item -LiteralPath $lockPath -Recurse -Force
}

$env:DB_CLIENT = 'sqlite'
$env:DB_PATH = 'G:\Database\database.db'
$env:DB_BACKUP_DIR = 'G:\Database\Backups'
$env:SQLITE_JOURNAL_MODE = 'WAL'
$env:NODE_SKIP_PLATFORM_CHECK = '1'
$env:HOST = '0.0.0.0'
$env:PORT = '5000'

Set-Location -LiteralPath $projectRoot
Write-Host 'Starting MainProject API. Keep this window open.'
& $nodePath server.js
