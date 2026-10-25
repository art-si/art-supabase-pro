# Payment reference workspace

Shared MDM maintenance for payment purposes and settlement methods. Each route supplies exact View/Add/Edit/Delete permissions. Referenced accounting attributes cannot be silently changed; disable and create a new value instead. Single and bulk deletion use `MasterDataDeleteGuard` and secured, tenant-scoped reference inspection. Referenced historical masters cannot be deleted.

The shared reference editor also maintains payable writeoff schemes: code, name, enable/automatic switches, typed matching fields and empty-value policy. Scheme execution is authoritative on the server, not inferred solely from the UI.
