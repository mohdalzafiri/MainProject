$ErrorActionPreference = 'Stop'
$outputPath = '\\LAPTOP-ABDULLAH\Desktop\MainProject.Api\.pc-server-diagnostic.txt'
$lines = @()

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = New-Object System.Security.Cryptography.SHA256Managed
    try {
      return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '')
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

try {
  $lines += 'ComputerName=' + $env:COMPUTERNAME

  $serverProcesses = Get-WmiObject Win32_Process |
    Where-Object {
      $_.Name -eq 'node.exe' -and
      $_.CommandLine -match 'server\.js'
    }

  if (!$serverProcesses) {
    $lines += 'ERROR=No node server.js process was found.'
  } else {
    foreach ($serverProcess in $serverProcesses) {
      $lines += 'ProcessId=' + $serverProcess.ProcessId
      $lines += 'ExecutablePath=' + $serverProcess.ExecutablePath
      $lines += 'CommandLine=' + $serverProcess.CommandLine
      $lines += 'ParentProcessId=' + $serverProcess.ParentProcessId

      $parentProcess = Get-WmiObject Win32_Process -Filter ('ProcessId = ' + $serverProcess.ParentProcessId)
      if ($parentProcess) {
        $lines += 'ParentName=' + $parentProcess.Name
        $lines += 'ParentCommandLine=' + $parentProcess.CommandLine
      }
    }
  }

  $candidateRoots = @(
    'C:\Users\Admin\MainProject.Api',
    'C:\MainProject.Api',
    ($env:USERPROFILE + '\MainProject.Api'),
    ($env:USERPROFILE + '\Desktop\MainProject.Api'),
    'C:\Program Files\MainProject',
    'C:\Program Files (x86)\MainProject'
  ) | Select-Object -Unique

  foreach ($root in $candidateRoots) {
    $dashboardPath = Join-Path $root 'public\mobile-dashboard.html'
    $serverPath = Join-Path $root 'server.js'
    if ((Test-Path -LiteralPath $dashboardPath) -or (Test-Path -LiteralPath $serverPath)) {
      $lines += 'CandidateRoot=' + $root
      $lines += 'CandidateHasServer=' + (Test-Path -LiteralPath $serverPath)
      $lines += 'CandidateHasDashboard=' + (Test-Path -LiteralPath $dashboardPath)
      if (Test-Path -LiteralPath $dashboardPath) {
        $lines += 'CandidateDashboardLength=' + (Get-Item -LiteralPath $dashboardPath).Length
        $lines += 'CandidateDashboardHash=' + (Get-Sha256 $dashboardPath)
      }
    }
  }
} catch {
  $lines += 'ERROR=' + $_.Exception.Message
}

$lines | Set-Content -LiteralPath $outputPath
$lines
