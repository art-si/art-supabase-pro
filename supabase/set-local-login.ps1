[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })][string]$LocalRoot,
  [Parameter(Mandatory = $true)][string]$Email,
  [securestring]$Password
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')

$LocalRoot = (Resolve-Path -LiteralPath $LocalRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $LocalRoot 'transfer-origin.json') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $LocalRoot 'supabase/config.toml') -PathType Leaf)) {
  throw 'This is not a local stack created by restore-local-supabase.ps1.'
}
if ([string]::IsNullOrWhiteSpace($Email) -or $Email -notmatch '^[^@\s]+@[^@\s]+$') {
  throw 'Provide an existing local Auth user email.'
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI is required to read the local stack status.'
}

Push-Location $LocalRoot
try {
  $result = Invoke-SupabaseQuiet @('status', '--output', 'json')
  if (-not $result.Succeeded) { throw 'The local Supabase stack is not running.' }
  $status = $result.Output | ConvertFrom-Json
  if (-not $status.API_URL -or -not $status.SERVICE_ROLE_KEY) {
    throw 'Local Supabase status is missing API_URL or SERVICE_ROLE_KEY.'
  }
  $apiUri = [uri]$status.API_URL
  if ($apiUri.Scheme -ne 'http' -or
      $apiUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
    throw 'The API URL is not a local HTTP endpoint; refusing to change a password.'
  }
  $apiUrl = ([string]$status.API_URL).TrimEnd('/')
  $headers = New-StorageAdminHeaders -Key ([string]$status.SERVICE_ROLE_KEY)
  $found = $null
  $page = 1
  do {
    $users = Invoke-RestMethod -Method Get `
      -Uri "$apiUrl/auth/v1/admin/users?page=$page&per_page=200" `
      -Headers $headers -TimeoutSec 30
    $items = @($users.users)
    $found = @($items | Where-Object { $_.email -eq $Email } | Select-Object -First 1)
    $page++
  } while ($found.Count -eq 0 -and $items.Count -eq 200)
  if ($found.Count -ne 1 -or $found[0].id -notmatch '^[a-fA-F0-9-]{36}$') {
    throw 'That email was not found among the restored local Auth users.'
  }

  if (-not $Password) {
    $Password = Read-Host 'New password for this local account only' -AsSecureString
  }
  $plainPassword = Get-PlainText $Password
  if ($plainPassword.Length -lt 8) { throw 'The local password must contain at least 8 characters.' }
  try {
    $body = @{ password = $plainPassword; email_confirm = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Put `
      -Uri "$apiUrl/auth/v1/admin/users/$($found[0].id)" `
      -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
  }
  finally {
    $body = $null
    $plainPassword = $null
  }
  Write-Host "Local-only password set for $Email. Sign in to the local app with this email and password." -ForegroundColor Green
}
finally { Pop-Location }
