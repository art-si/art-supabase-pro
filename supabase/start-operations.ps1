$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
Enable-SystemProxyForSupabaseCli
Push-Location (Split-Path -Parent $PSScriptRoot)
try { & node --import tsx scripts/supabase-operations.ts }
finally { Pop-Location }
