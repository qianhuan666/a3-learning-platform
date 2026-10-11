$ErrorActionPreference = 'Stop'

$EnvFile = 'D:\PostgreSQL\16\pg_env.bat'
$Content = @(
  '@ECHO OFF',
  'REM The script sets environment variables helpful for PostgreSQL',
  '',
  '@SET PATH=D:\PostgreSQL\16\bin;%PATH%',
  '@SET PGDATA=D:\PostgreSQL\16\data',
  '@SET PGDATABASE=postgres',
  '@SET PGUSER=postgres',
  '@SET PGPORT=5432',
  '@SET PGLOCALEDIR=D:\PostgreSQL\16\share\locale',
  ''
)

Set-Content -LiteralPath $EnvFile -Value $Content -Encoding ASCII
Get-Content -LiteralPath $EnvFile
