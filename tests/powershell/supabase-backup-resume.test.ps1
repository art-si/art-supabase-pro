$ErrorActionPreference = 'Stop'
$projectRef = 'ckbftoopuyophiebamwy'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("supabase-resume-test-$([guid]::NewGuid().ToString('N'))")
$fixtureSupabase = Join-Path $fixtureRoot 'supabase'
$backup = Join-Path $fixtureSupabase 'backups/fixture'
New-Item -ItemType Directory -Force -Path "$fixtureSupabase/.temp", "$backup/database", "$backup/metadata", "$backup/supabase/functions/example" | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../supabase/backup-supabase.ps1') -Destination $fixtureSupabase
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../supabase/transfer-common.ps1') -Destination $fixtureSupabase
Set-Content -LiteralPath "$fixtureSupabase/.temp/project-ref" -Value $projectRef
Set-Content -LiteralPath "$fixtureSupabase/.temp/pooler-url" -Value "postgresql://postgres.$projectRef@fixture.pooler.supabase.com:5432/postgres"
foreach ($name in @('roles.sql', 'schema.sql', 'data.sql', 'migration-history-schema.sql', 'migration-history-data.sql', 'managed-schema-snapshot.sql')) {
  Set-Content -LiteralPath "$backup/database/$name" -Value @('-- fixture', '-- PostgreSQL database dump complete', 'ADD CONSTRAINT fixture PRIMARY KEY (id);', 'RESET ALL;')
}
Set-Content -LiteralPath "$backup/metadata/functions.json" -Value '[{"slug":"example","verify_jwt":true}]'
Set-Content -LiteralPath "$backup/supabase/functions/example/index.ts" -Value '// original downloaded source'
$originalDumpHash = (Get-FileHash -LiteralPath "$backup/database/data.sql").Hash

function supabase {
  $global:LASTEXITCODE = 0
  $command = $args -join ' '
  if ($command -eq 'projects list --agent=no --output json') { return "[{`"ref`":`"$projectRef`"}]" }
  if ($command -eq '--version') { return 'fixture' }
  if ($command -eq "projects api-keys --project-ref $projectRef --output json") { return '[{"name":"service_role","api_key":"fixture-key"}]' }
  if ($command -like 'db query *from storage.buckets*') { return '[{"id":"fixture-bucket"}]' }
  if ($command -like 'db query *from storage.objects*') { return '[{"bucket_id":"fixture-bucket","object_count":1}]' }
  if ($command -like 'storage cp *') {
    $workdirIndex = [array]::IndexOf($args, '--workdir')
    if ($workdirIndex -lt 0 -or $args[$workdirIndex + 1] -ne $fixtureRoot) { throw 'Storage download must use the original linked project workdir.' }
    Set-Content -LiteralPath (Join-Path $PWD 'object.txt') -Value 'storage fixture'
    return
  }
  if ($command -like 'secrets list *' -or $command -like 'db query *') { return '[]' }
  throw "Resume unexpectedly invoked a CLI operation: $command"
}

try {
  & "$fixtureSupabase/backup-supabase.ps1" -ResumeBackupPath $backup
  if ((Get-FileHash -LiteralPath "$backup/database/data.sql").Hash -ne $originalDumpHash) { throw 'Resume changed the original database dump.' }
  if ((Get-FileHash -LiteralPath "$backup/functions/example/index.ts").Hash -ne
      (Get-FileHash -LiteralPath "$backup/supabase/functions/example/index.ts").Hash) { throw 'Function copy did not preserve source bytes.' }
  if (-not (Test-Path -LiteralPath "$backup/manifest.json")) { throw 'Resume did not finish the manifest.' }
  if (-not (Test-Path -LiteralPath "$backup/storage/fixture-bucket/object.txt")) { throw 'Resume did not download Storage objects.' }
  $rejected = $false
  try { & "$fixtureSupabase/backup-supabase.ps1" -ResumeBackupPath $backup } catch { $rejected = $_.Exception.Message -like '*completion manifest*' }
  if (-not $rejected) { throw 'Completed backups must reject resume.' }
  . "$fixtureSupabase/transfer-common.ps1"
  if ((Get-SupabaseServiceRoleKey -ProjectRef $projectRef) -ne 'fixture-key') { throw 'API key retrieval used unsupported arguments.' }
  Remove-Item -LiteralPath "$backup/manifest.json"
  Set-Content -LiteralPath "$backup/database/data.sql" -Value '-- interrupted dump'
  $rejected = $false
  try { & "$fixtureSupabase/backup-supabase.ps1" -ResumeBackupPath $backup } catch { $rejected = $_.Exception.Message -like '*incomplete database dump*' }
  if (-not $rejected) { throw 'Incomplete database dumps must reject resume.' }
  Write-Host 'Backup resume regression checks passed.'
}
finally {
  $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
  if (-not $resolvedFixture.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolvedFixture) -notlike 'supabase-resume-test-*') { throw 'Unsafe fixture cleanup path.' }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
