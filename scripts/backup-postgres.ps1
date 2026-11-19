param(
  [string]$PsqlBinDirectory,
  [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA "Jianjian\database-backups"),
  [switch]$VerifyRestore
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiEnvPath = Join-Path $repositoryRoot "apps\api\.env"
$resolvedBackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
$repositoryPrefix = $repositoryRoot.TrimEnd("\") + "\"
if ($resolvedBackupDirectory.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or $resolvedBackupDirectory.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup directory must be outside the repository."
}

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl) {
  if (-not (Test-Path -LiteralPath $apiEnvPath -PathType Leaf)) {
    throw "未找到 apps\api\.env。请先运行本地 PostgreSQL 初始化流程。"
  }
  $databaseLine = Get-Content -LiteralPath $apiEnvPath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -Last 1
  if ($databaseLine -match '^\s*DATABASE_URL\s*=\s*(.*)\s*$') {
    $databaseUrl = $Matches[1].Trim()
    if ($databaseUrl.Length -ge 2 -and $databaseUrl.StartsWith('"') -and $databaseUrl.EndsWith('"')) {
      $databaseUrl = $databaseUrl.Substring(1, $databaseUrl.Length - 2)
    } elseif ($databaseUrl.Length -ge 2 -and $databaseUrl.StartsWith("'") -and $databaseUrl.EndsWith("'")) {
      $databaseUrl = $databaseUrl.Substring(1, $databaseUrl.Length - 2)
    }
  }
}
if (-not $databaseUrl) {
  throw "DATABASE_URL 未配置。"
}

try {
  $connection = [Uri]::new($databaseUrl)
} catch {
  throw "DATABASE_URL 格式无效。请检查本地 API 配置。"
}
if ($connection.Scheme -notin @("postgres", "postgresql") -or -not $connection.Host) {
  throw "DATABASE_URL 必须是有效的 PostgreSQL 连接地址。"
}

$databaseName = [Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart("/"))
if (-not $databaseName -or $databaseName.Contains("/")) {
  throw "DATABASE_URL 未包含有效数据库名称。"
}
$credentials = $connection.UserInfo.Split(":", 2)
if ($credentials.Count -ne 2) {
  throw "DATABASE_URL 必须包含数据库账号和密码。"
}

if ($PsqlBinDirectory) {
  $pgDump = Join-Path $PsqlBinDirectory "pg_dump.exe"
  $pgRestore = Join-Path $PsqlBinDirectory "pg_restore.exe"
  $createdb = Join-Path $PsqlBinDirectory "createdb.exe"
  $dropdb = Join-Path $PsqlBinDirectory "dropdb.exe"
  foreach ($tool in @($pgDump, $pgRestore, $createdb, $dropdb)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
      throw "找不到 PostgreSQL 工具：$tool"
    }
  }
} else {
  $pgDump = (Get-Command pg_dump.exe -ErrorAction Stop).Source
  $pgRestore = (Get-Command pg_restore.exe -ErrorAction Stop).Source
  $createdb = (Get-Command createdb.exe -ErrorAction Stop).Source
  $dropdb = (Get-Command dropdb.exe -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedBackupDirectory "jianjian-$timestamp.dump"
if (Test-Path -LiteralPath $backupPath) {
  throw "备份文件已存在，未覆盖现有文件。"
}

$pgVariables = @("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGCONNECT_TIMEOUT", "PGSSLMODE")
$previousPgEnvironment = @{}
foreach ($name in $pgVariables) {
  $previousPgEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
$temporaryDatabase = $null
$temporaryDatabaseCreated = $false
$archiveValidated = $false

try {
  $env:PGHOST = $connection.Host
  $env:PGPORT = if ($connection.IsDefaultPort) { "5432" } else { [string]$connection.Port }
  $env:PGUSER = [Uri]::UnescapeDataString($credentials[0])
  $env:PGPASSWORD = [Uri]::UnescapeDataString($credentials[1])
  $env:PGDATABASE = $databaseName
  $env:PGCONNECT_TIMEOUT = "10"
  $env:PGSSLMODE = "prefer"
  if ($connection.Query -match '(?:^\?|[?&])sslmode=([^&]+)') {
    $env:PGSSLMODE = [Uri]::UnescapeDataString($Matches[1])
  }

  & $pgDump --format=custom --no-owner --no-acl --file=$backupPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump 失败，退出代码：$LASTEXITCODE"
  }

  & $pgRestore --list $backupPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "备份归档目录校验失败。"
  }
  $archiveValidated = $true

  if ($VerifyRestore) {
    $env:PGDATABASE = "postgres"
    $temporaryDatabase = "jianjian_restore_verify_$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
    & $createdb $temporaryDatabase
    if ($LASTEXITCODE -ne 0) {
      throw "无法创建临时恢复验证数据库，退出代码：$LASTEXITCODE"
    }
    $temporaryDatabaseCreated = $true

    & $pgRestore --exit-on-error --single-transaction --no-owner --no-acl --dbname=$temporaryDatabase $backupPath
    if ($LASTEXITCODE -ne 0) {
      throw "备份已生成，但在临时数据库中的完整恢复验证失败，退出代码：$LASTEXITCODE"
    }
  }

  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $size = (Get-Item -LiteralPath $backupPath).Length
  Write-Output "备份完成：$backupPath"
  Write-Output "大小：$size bytes"
  Write-Output "SHA-256：$hash"
  if ($VerifyRestore) {
    Write-Output "恢复验证：完整恢复通过。"
  } else {
    Write-Output "恢复验证：仅校验了归档目录；完整恢复测试可加 -VerifyRestore。"
  }
} catch {
  if ((-not $archiveValidated) -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
  } elseif (Test-Path -LiteralPath $backupPath) {
    Write-Warning "备份归档有效但恢复演练失败，已保留备份：$backupPath"
  }
  throw
} finally {
  if ($temporaryDatabaseCreated) {
    & $dropdb --if-exists $temporaryDatabase
    if ($LASTEXITCODE -ne 0) {
      Write-Error "无法清理恢复验证数据库 $temporaryDatabase；请由数据库管理员检查并手动删除该临时数据库。"
    }
  }
  foreach ($name in $pgVariables) {
    [Environment]::SetEnvironmentVariable($name, $previousPgEnvironment[$name], "Process")
  }
}
