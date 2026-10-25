# Platform tenant scope switcher

Header-level tenant scope for the server-confirmed platform super administrator.

- The signed-in account belongs to the platform tenant. Only a positive `current_is_super()` capability exposes the switcher; a role code in a persisted profile is insufficient.
- `null` means the “全部租户” aggregate read scope. It does not change the account's own tenant.
- In the aggregate scope, authorized business writes use the affected row, a tenant-owned parent, or an explicit tenant selection. They never default to the signed-in platform tenant.
- A concrete tenant ID limits ordinary tenant-owned reads and writes to that tenant.
- Tenant options come from the exported system-management API; the component never accesses the transport client directly.
- The selected scope is stored for the current browser session and reset when the signed-in user changes.
