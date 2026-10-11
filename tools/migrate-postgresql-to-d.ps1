$ErrorActionPreference = 'Stop'

$ServiceName = 'postgresql-x64-16'
$SourceRoot = 'C:\Program Files\PostgreSQL'
$TargetRoot = 'D:\PostgreSQL'
$TargetVersionRoot = Join-Path $TargetRoot '16'
$LogDir = 'D:\A3\artifacts\logs'
$LogFile = Join-Path $LogDir 'postgresql-migration.log'

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Start-Transcript -Path $LogFile -Append | Out-Null

try {
  Write-Host "Starting PostgreSQL migration at $(Get-Date -Format s)"
  Write-Host "Source: $SourceRoot"
  Write-Host "Target: $TargetRoot"

  if (-not (Test-Path -LiteralPath $SourceRoot)) {
    throw "Source not found: $SourceRoot"
  }

  if (Test-Path -LiteralPath $TargetRoot) {
    throw "Target already exists, refusing to overwrite: $TargetRoot"
  }

  $oldImagePath = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName").ImagePath
  Write-Host "Old ImagePath: $oldImagePath"

  Write-Host "Stopping service $ServiceName ..."
  Stop-Service -Name $ServiceName -Force
  (Get-Service -Name $ServiceName).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(90))

  Write-Host "Copying PostgreSQL tree with ACLs ..."
  New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
  & robocopy $SourceRoot $TargetRoot /E /COPYALL /DCOPY:DAT /R:2 /W:2 /XJ
  $copyCode = $LASTEXITCODE
  Write-Host "Robocopy exit code: $copyCode"
  if ($copyCode -ge 8) {
    throw "robocopy failed with exit code $copyCode"
  }

  if (-not (Test-Path -LiteralPath (Join-Path $TargetVersionRoot 'bin\pg_ctl.exe'))) {
    throw "Copied pg_ctl.exe not found under $TargetVersionRoot"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $TargetVersionRoot 'data\PG_VERSION'))) {
    throw "Copied data directory not found under $TargetVersionRoot"
  }

  $newImagePath = '"D:\PostgreSQL\16\bin\pg_ctl.exe" runservice -N "postgresql-x64-16" -D "D:\PostgreSQL\16\data" -w'
  Write-Host "New ImagePath: $newImagePath"
  & sc.exe config $ServiceName binPath= $newImagePath
  if ($LASTEXITCODE -ne 0) {
    throw "sc.exe config failed"
  }

  Write-Host "Starting service $ServiceName ..."
  Start-Service -Name $ServiceName
  (Get-Service -Name $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(90))

  $actualImagePath = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName").ImagePath
  Write-Host "Actual ImagePath: $actualImagePath"

  & 'D:\PostgreSQL\16\bin\pg_isready.exe' -h 127.0.0.1 -p 5432
  if ($LASTEXITCODE -ne 0) {
    throw "pg_isready failed"
  }

  Write-Host "PostgreSQL migration completed successfully."
  Write-Host "C drive source was kept for rollback: $SourceRoot"
} catch {
  Write-Host "Migration failed: $($_.Exception.Message)"
  throw
} finally {
  Stop-Transcript | Out-Null
}
