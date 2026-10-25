$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../supabase/transfer-common.ps1')

$projectRef = 'ckbftoopuyophiebamwy'
$originalToken = $env:SUPABASE_ACCESS_TOKEN
$script:calls = 0
$script:scenario = ''
$script:loggedIn = $false
$script:loginCalls = 0

function supabase {
  if (($args -join ' ') -ne 'login --agent=no') { throw 'Unexpected login CLI arguments.' }
  $script:loginCalls++
  if ($script:scenario -eq 'interactive-login') {
    if ($env:SUPABASE_ACCESS_TOKEN) { throw 'Inherited token overrides browser login.' }
    $script:loggedIn = $true
    $global:LASTEXITCODE = 0
  }
  else { $global:LASTEXITCODE = 1 }
}

function Invoke-SupabaseQuiet {
  param([string[]]$Arguments)

  if (($Arguments -join ' ') -ne 'projects list --agent=no --output json') {
    throw 'Project lookup must use supported CLI arguments.'
  }

  $script:calls++
  if (($script:scenario -eq 'saved-login' -and -not $env:SUPABASE_ACCESS_TOKEN) -or
      ($script:scenario -eq 'environment-token' -and $env:SUPABASE_ACCESS_TOKEN) -or
      ($script:scenario -eq 'interactive-login' -and $script:loggedIn)) {
    return [pscustomobject]@{
      Succeeded = $true
      Output = '{"projects":[{"ref":"ckbftoopuyophiebamwy"}]}'
    }
  }
  if ($script:scenario -eq 'array') {
    return [pscustomobject]@{ Succeeded = $true; Output = '[{"ref":"ckbftoopuyophiebamwy"}]' }
  }
  if ($script:scenario -eq 'network') {
    return [pscustomobject]@{ Succeeded = $false; Output = ''; Error = 'connection timeout' }
  }
  return [pscustomobject]@{ Succeeded = $false; Output = '{"error":{"message":"Invalid access token"}}'; Error = '' }
}

try {
  $script:scenario = 'saved-login'
  $env:SUPABASE_ACCESS_TOKEN = 'invalid-fixture-token'
  Assert-SupabaseCliProjectAccess -ProjectRef $projectRef
  if ($script:calls -ne 2 -or $env:SUPABASE_ACCESS_TOKEN) {
    throw 'The saved CLI login did not replace an invalid inherited token.'
  }

  $script:scenario = 'environment-token'
  $script:calls = 0
  $env:SUPABASE_ACCESS_TOKEN = 'valid-fixture-token'
  Assert-SupabaseCliProjectAccess -ProjectRef $projectRef
  if ($script:calls -ne 1 -or $env:SUPABASE_ACCESS_TOKEN -ne 'valid-fixture-token') {
    throw 'A working environment token was not preserved.'
  }

  $script:scenario = 'no-access'
  $script:calls = 0
  $env:SUPABASE_ACCESS_TOKEN = 'invalid-fixture-token'
  $failed = $false
  try { Assert-SupabaseCliProjectAccess -ProjectRef $projectRef -NonInteractive }
  catch { $failed = $true }
  if (-not $failed -or $script:calls -ne 2 -or
      $env:SUPABASE_ACCESS_TOKEN -ne 'invalid-fixture-token') {
    throw 'An unavailable saved login did not fail and restore the environment token.'
  }

  $script:scenario = 'interactive-login'
  Assert-SupabaseCliProjectAccess -ProjectRef $projectRef
  if ($script:loginCalls -ne 1 -or $env:SUPABASE_ACCESS_TOKEN) {
    throw 'Browser login did not recover expired credentials.'
  }

  $script:scenario = 'array'
  Assert-SupabaseCliProjectAccess -ProjectRef $projectRef

  foreach ($scenario in @('network', 'cancelled')) {
    $script:scenario = $scenario
    $env:SUPABASE_ACCESS_TOKEN = 'invalid-fixture-token'
    $beforeLogin = $script:loginCalls
    $failed = $false
    try { Assert-SupabaseCliProjectAccess -ProjectRef $projectRef }
    catch { $failed = $true }
    if (-not $failed -or $env:SUPABASE_ACCESS_TOKEN -ne 'invalid-fixture-token') {
      throw 'Failed recovery must stop and preserve the inherited token.'
    }
    $expectedLoginCalls = if ($scenario -eq 'network') { 0 } else { 1 }
    if ($script:loginCalls -ne ($beforeLogin + $expectedLoginCalls)) {
      throw 'Network failures must not trigger login; cancelled login must not loop.'
    }
  }

  Write-Host 'Supabase CLI project authentication fallback checks passed.' -ForegroundColor Green
}
finally {
  if ($null -eq $originalToken) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  }
  else {
    $env:SUPABASE_ACCESS_TOKEN = $originalToken
  }
}
