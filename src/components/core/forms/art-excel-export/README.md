# ArtExcelExport

Use this button for data already loaded by the current workspace. Paginated table exports remain owned by `ArtTableQuery`.

The component requires the platform Router and Pinia providers. Each export captures the route lifetime, authenticated user and tenant scope with `useTenantOperationGuard`. Leaving that context prevents the pending download and suppresses its later progress, success and error feedback. The file utility also retains its independent tenant-scope check immediately before saving.

`before-export` runs synchronously before the submitted rows and filename are captured. The shared file utility formats rows into strings and resolves column widths before its first asynchronous import or progress notification. Later array or cell changes therefore do not alter that workbook. `export-success` and the default success message describe the submitted filename and row count.

Keep business authorization on the calling action. This component has no business-permission prop; its context guard does not infer a permission from `v-auth` or check a permission revoked within the same route, user and tenant context.
