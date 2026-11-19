param(
  [string]$PsqlPath = "psql",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5432,
  [string]$Database = "jianjian"
)

$ErrorActionPreference = "Stop"

if ($Database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "Database name must contain only letters, numbers, and underscores."
}
if ($Port -lt 1 -or $Port -gt 65535) {
  throw "PostgreSQL port must be between 1 and 65535."
}

$resolvedPsql = Get-Command $PsqlPath -ErrorAction SilentlyContinue
if (-not $resolvedPsql) {
  if (Test-Path -LiteralPath $PsqlPath -PathType Leaf) {
    $resolvedPsql = Get-Item -LiteralPath $PsqlPath
  } else {
    throw "Could not find psql. Pass its full path with -PsqlPath."
  }
}
$psqlExecutable = $resolvedPsql.Source
if (-not $psqlExecutable) {
  $psqlExecutable = $resolvedPsql.FullName
}
$createdbExecutable = Join-Path (Split-Path -Parent $psqlExecutable) "createdb.exe"
if (-not (Test-Path -LiteralPath $createdbExecutable -PathType Leaf)) {
  throw "Could not find createdb.exe beside psql.exe."
}

$environmentFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path -LiteralPath $environmentFile) {
  throw "apps/api/.env already exists. Refusing to overwrite local configuration."
}

$adminUser = Read-Host "PostgreSQL database-owner account [postgres]"
if ([string]::IsNullOrWhiteSpace($adminUser)) {
  $adminUser = "postgres"
}
if ($adminUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "PostgreSQL account name must contain only letters, numbers, and underscores."
}

$securePassword = Read-Host "Enter the local PostgreSQL password (input is hidden)" -AsSecureString
if ($securePassword.Length -eq 0) {
  throw "The PostgreSQL password cannot be empty."
}

$passwordPointer = [IntPtr]::Zero
try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PGPASSWORD = $password

  $connectionArgs = @(
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--host", $HostName, "--port", "$Port", "--username", $adminUser,
    "--dbname", "postgres", "--no-password", "--tuples-only", "--no-align"
  )
  $probe = & $psqlExecutable @connectionArgs --command "SELECT 1" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Could not connect to PostgreSQL at ${HostName}:$Port as ${adminUser}. Verify the service and account, then retry."
  }

  $existingOwner = & $psqlExecutable @connectionArgs --command "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$Database'" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Could not check the local database."
  }
  $existingOwner = "$existingOwner".Trim()
  if (-not $existingOwner) {
    & $createdbExecutable --host $HostName --port $Port --username $adminUser --no-password --owner $adminUser $Database
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create database '$Database'."
    }
  } elseif ($existingOwner -ne $adminUser) {
    throw "Database '$Database' already exists with owner '$existingOwner', not '$adminUser'. Refusing to change it."
  }

  function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $random.GetBytes($bytes)
      return [Convert]::ToHexString($bytes).ToLowerInvariant()
    } finally {
      $random.Dispose()
    }
  }

  $databaseUser = [Uri]::EscapeDataString($adminUser)
  $databasePassword = [Uri]::EscapeDataString($password)
  $databaseUrl = "postgresql://${databaseUser}:${databasePassword}@${HostName}:$Port/${Database}?schema=public"
  $configuration = @(
    "# Local development configuration. Do not commit or reuse in production."
    "NODE_ENV=development"
    "PORT=3001"
    "DATABASE_URL=$databaseUrl"
    "JWT_ACCESS_SECRET=$(New-LocalSecret)"
    "IDENTITY_HASH_SECRET=$(New-LocalSecret)"
    "DATA_ENCRYPTION_KEY=$(New-LocalSecret)"
    "PUBLIC_REPORT_BASE_URL=http://localhost:5173"
    "WEB_ORIGINS=http://localhost:5173"
    "WECHAT_MINIAPP_APP_ID="
    "WECHAT_MINIAPP_APP_SECRET="
    "S3_REGION=us-east-1"
    "S3_FORCE_PATH_STYLE=false"
    "MAX_UPLOAD_BYTES=20971520"
  ) -join "`n"

  [System.IO.File]::WriteAllText(
    (Join-Path $PSScriptRoot "..\.env"),
    "$configuration`n",
    (New-Object System.Text.UTF8Encoding($false))
  )
  Write-Host "Created local database '$Database' and apps/api/.env."
  Write-Host "The password was entered locally and was not printed. Keep this development account off production systems."
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  if ($securePassword) {
    $securePassword.Dispose()
  }
}
