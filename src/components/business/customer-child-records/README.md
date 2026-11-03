# CustomerChildRecords

Shared customer contact and finance table editor for TMS and MDM customer dialogs.

## Contract

| Prop | Meaning |
| --- | --- |
| `kind` | `contact` or `finance` child table. |
| `customerId` | Saved parent customer ID. The component does not create a parent. |
| `tenantId` | Optional display context; the database derives child tenant from the parent. |
| `fieldAccess` | Parent customer's `contactPhone`, `taxNo`, and `bankAccount` access levels. Sensitive controls and columns follow this map. |
| `permissionScope` | `TmsCustomer` (default) or `MdmSalesCustomer`; exact Add, Edit, Copy, Delete permissions come from that page. |
| `readonly` | Hides mutation actions and disables default switches in view-only dialogs. |

The component emits `changed` after a successful mutation so the parent can refresh its customer list. All writes use [customer-children.ts](../../../api/customer-children.ts), which calls the same scoped RPCs for both applications. `MasterDataDeleteGuard` checks references before deletion; finance records linked to orders remain blocked with navigable order details.

The table supplies loading, empty, error and retry states through `ArtTableQuery`. The editor uses `ArtForm` metadata and `ArtDialog`. Parent dialogs should mount it only after the customer has an ID; lazy tabs avoid loading both child tables on open.
