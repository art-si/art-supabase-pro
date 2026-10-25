# Payable settlement workspace

Shared application/payment workspace. Route entries own exact permissions; the API owns secured RPC transport. One application can include multiple suppliers; draft amounts reserve the related payable and a downstream payment consumes, rather than duplicates, its application quota.

Confirmation registers actual fund entries. Writeoff records separately reduce payable balances according to enabled matching schemes. Cancellation posts reversing fund entries and preserves execution history; it is not a bank refund instruction. TMS payments reuse the existing carrier cash, allocation, ledger and posting events.

`SettlementDocumentDrawer.open(record?, editable?)` opens the shared editor. Existing records are reloaded before opening. Reference loading errors block saves and offer retry. Stored draft deletion uses `MasterDataDeleteGuard` and secured dependency checks.
