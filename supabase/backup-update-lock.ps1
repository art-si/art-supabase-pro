[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$BackupPath)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transfer-common.ps1')
Enter-BackupReadLease -Root $BackupPath -AllowPendingUpdate
[Console]::Out.WriteLine('BACKUP_LOCK_ACQUIRED')
[Console]::Out.Flush()
[void][Console]::In.ReadToEnd()
