param(
  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$PostgresRoot = 'D:\PostgreSQL\16',
  [string]$ServiceName = 'postgresql-x64-16',
  [string]$UserName = 'postgres'
)

$ErrorActionPreference = 'Stop'

$dataDir = Join-Path $PostgresRoot 'data'
$binDir = Join-Path $PostgresRoot 'bin'
$pgHba = Join-Path $dataDir 'pg_hba.conf'
$backup = Join-Path $dataDir ("pg_hba.conf.before-password-reset-{0}.bak" -f (Get-Date -Format 'yyyyMMddHHmmss'))
$psql = Join-Path $binDir 'psql.exe'
$pgCtl = Join-Path $binDir 'pg_ctl.exe'

Copy-Item -LiteralPath $pgHba -Destination $backup -Force

try {
  $content = Get-Content -LiteralPath $pgHba
  $content = $content | ForEach-Object {
    if ($_ -match '^\s*(local\s+all\s+all\s+)(scram-sha-256|md5)\s*$') {
      return ($Matches[1] + 'trust')
    }
    if ($_ -match '^\s*(host\s+all\s+all\s+127\.0\.0\.1/32\s+)(scram-sha-256|md5)\s*$') {
      return ($Matches[1] + 'trust')
    }
    if ($_ -match '^\s*(host\s+all\s+all\s+::1/128\s+)(scram-sha-256|md5)\s*$') {
      return ($Matches[1] + 'trust')
    }
    return $_
  }
  Set-Content -LiteralPath $pgHba -Value $content -Encoding ASCII

  & $pgCtl reload -D $dataDir
  Start-Sleep -Seconds 3

  & $psql -h 127.0.0.1 -U $UserName -d postgres -c "alter user $UserName with password '$Password';"
}
finally {
  Copy-Item -LiteralPath $backup -Destination $pgHba -Force
  & $pgCtl reload -D $dataDir
}

Write-Host "Password reset finished. Backup: $backup"
