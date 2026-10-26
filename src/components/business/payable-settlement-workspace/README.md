# Payable settlement workspace

Shared application/payment workspace. Route entries own exact permissions; the API owns secured RPC transport. One application can include multiple suppliers; draft amounts reserve the related payable and a downstream payment consumes, rather than duplicates, its application quota.

Confirmation registers actual fund entries. Writeoff records separately reduce payable balances according to enabled matching schemes. Cancellation posts reversing fund entries and preserves execution history; it is not a bank refund instruction. TMS payments reuse the existing carrier cash, allocation, ledger and posting events.

`SettlementDocumentDrawer.open(record?, editable?)` opens the shared editor. Existing records are reloaded before opening. Reference loading errors block saves and offer retry. Stored draft deletion uses `MasterDataDeleteGuard` and secured dependency checks.

Lists, document summaries, line values, fees and print output use the document's original currency. Original account-set names, base currencies and booking rates are displayed only from returned metadata; the editor does not reconstruct historical rates or local carrying balances. A counterparty balance uses its explicit currency when provided, otherwise remains a plain number under the base-currency label.

`settlementFundAccountOptions` applies the document, every line's known source account set and other lines' selected fund accounts together with currency and settlement-method category. This also constrains manual drafts before a source or header book is assigned. The current field's selected account does not lock itself, so an otherwise unconstrained draft can still correct that selection. Conflicting source books yield no selectable account rather than allowing each row to use a different book. The database remains authoritative for write and confirmation checks.

The first source of an unsaved draft can supply its original currency and account-set context. Existing documents and other bound lines constrain subsequent selections; incompatible sources remain visible but disabled with a reason. Actual receiving suppliers are distinct from liability suppliers and must not be replaced with the latter. Sources never supply the new document's booking rate: foreign drafts may explicitly enter a positive rate or leave it empty for the server's book/date lookup. Source identity and supplier captions remain fixed while editing later columns.

Counterparty balances use the canonical payable report's stored local-currency reductions, including final-cent allocation. An explicitly unavailable balance remains unavailable; it must not fall back to another supplier total or zero. The backend preserves its existing CNY-aggregate policy and returns unavailable for unreadable, inconsistent or nonmergeable base-currency data. The original-book and currency backend was deployed on 2026-10-26; payable downpush keeps the source book and original currency while the new payment uses its own booking rate.

Overlay save actions also consume `ArtForm.readyToSubmit`, not just the workspace's reference-loading flag. Required controls and remote options must be ready before a first click can submit; a pending form request must not turn that click into a silent validation rejection.
