$ErrorActionPreference = 'Stop'

$PostgresBin = 'D:\PostgreSQL\16\bin'
$DatabaseName = $env:PGDATABASE
if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
  $DatabaseName = 'a3_learning'
}

$UserName = $env:PGUSER
if ([string]::IsNullOrWhiteSpace($UserName)) {
  $UserName = 'postgres'
}

$HostName = $env:PGHOST
if ([string]::IsNullOrWhiteSpace($HostName)) {
  $HostName = '127.0.0.1'
}

if ([string]::IsNullOrWhiteSpace($env:PGPASSWORD) -and [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw 'Set PGPASSWORD or DATABASE_URL before running this script. Do not commit passwords.'
}

$psql = Join-Path $PostgresBin 'psql.exe'
$createdb = Join-Path $PostgresBin 'createdb.exe'

$exists = & $psql -h $HostName -U $UserName -d postgres -tAc "select 1 from pg_database where datname = '$DatabaseName'"
$existsText = if ($null -eq $exists) { '' } else { ($exists -join '').Trim() }
if ($existsText -ne '1') {
  & $createdb -h $HostName -U $UserName $DatabaseName
}

& $psql -h $HostName -U $UserName -d $DatabaseName -f 'D:\A3\database\schema.sql'
& $psql -h $HostName -U $UserName -d $DatabaseName -f 'D:\A3\database\seed.sql'
& $psql -h $HostName -U $UserName -d $DatabaseName -c 'select count(*) as plans from study_plans; select count(*) as tasks from learning_tasks; select count(*) as resources from learning_resources;'
