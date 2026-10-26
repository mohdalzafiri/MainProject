param(
  [string]$TargetRoot = 'C:\Users\Admin\MainProject.Api'
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$files = @(
  'local-client.js',
  'auth\dataScope.js',
  'auth\permissions.js',
  'database.js',
  'mobile\daily.html',
  'mobile\employees.html',
  'mobile\holidays.html',
  'mobile\incoming.html',
  'mobile\outgoing.html',
  'mobile\outside-employees.html',
  'mobile\query.html',
  'mobile\transfers.html',
  'public\administrative.html',
  'public\archive-folder.html',
  'public\archive.html',
  'public\courses.html',
  'public\daily.html',
  'public\daily-scanner.js',
  'public\department-mail.html',
  'public\favicon.ico',
  'public\dashboard.html',
  'public\employees.html',
  'public\evaluations.html',
  'public\login.html',
  'public\mobile-dashboard.html',
  'public\query.html',
  'public\reduction.html',
  'public\role-access.js',
  'public\settings.html',
  'public\status-catalog.js',
  'public\statistics-page.js',
  'public\system-log.html',
  'public\job-title-options.js',
  'public\mobile-password.html',
  'public\mobile-profile.html',
  'public\profile-image-store.js',
  'routes\archive.js',
  'routes\attachments.js',
  'routes\auth.js',
  'routes\dailyLogs.js',
  'routes\dailyScans.js',
  'routes\departmentMail.js',
  'routes\departmentMailScans.js',
  'routes\index.js',
  'routes\evaluations.js',
  'routes\reduction.js',
  'routes\settings.js',
  'server.js',
  'services\archiveCategoryService.js',
  'services\dailyScanStorage.js',
  'services\departmentMailScanStorage.js',
  'services\pdfScanUpload.js',
  'services\systemLogLocalization.js',
  'test\dailyScanner.test.js',
  'test\localClient.test.js',
  'utils\dailyScanNaming.js',
  'utils\departmentMailScanNaming.js'
)

if (!(Test-Path -LiteralPath (Join-Path $sourceRoot 'server.js'))) {
  throw "Gateway source project was not found at $sourceRoot"
}
if (!(Test-Path -LiteralPath (Join-Path $TargetRoot 'server.js'))) {
  throw "PC-SERVER project was not found at $TargetRoot"
}

$listener = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction Stop |
  Select-Object -First 1
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
if (!$serverProcess -or $serverProcess.CommandLine -notmatch 'server\.js') {
  throw "Port 5000 is not owned by the expected server.js process."
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $TargetRoot ".deployment-backup\$stamp"

foreach ($relativePath in $files) {
  $sourcePath = Join-Path $sourceRoot $relativePath
  $targetPath = Join-Path $TargetRoot $relativePath
  if (!(Test-Path -LiteralPath $sourcePath)) {
    throw "Deployment source file is missing: $relativePath"
  }

  if (Test-Path -LiteralPath $targetPath) {
    $backupPath = Join-Path $backupRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path $backupPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
  }

  New-Item -ItemType Directory -Path (Split-Path $targetPath -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

$deletedPath = Join-Path $TargetRoot 'public\force-list.js'
if (Test-Path -LiteralPath $deletedPath) {
  $deletedBackupPath = Join-Path $backupRoot 'public\force-list.js'
  New-Item -ItemType Directory -Path (Split-Path $deletedBackupPath -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $deletedPath -Destination $deletedBackupPath -Force
  Remove-Item -LiteralPath $deletedPath -Force
}

$nodePath = $serverProcess.ExecutablePath
if (!$nodePath -or !(Test-Path -LiteralPath $nodePath)) {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
}

Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
Start-Sleep -Seconds 2
Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $TargetRoot

$health = $null
for ($attempt = 1; $attempt -le 15; $attempt += 1) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri 'http://localhost:5000/api/health' -TimeoutSec 3
    if ($health.status -eq 'ok') {
      break
    }
  } catch {
    if ($attempt -eq 15) {
      throw
    }
  }
}

if ($health.status -ne 'ok') {
  throw 'PC-SERVER did not become healthy after deployment.'
}

[pscustomobject]@{
  Status = 'deployed'
  FilesCopied = $files.Count
  Backup = $backupRoot
  ServerPid = (Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object -First 1).OwningProcess
  Health = $health.status
} | ConvertTo-Json -Compress
