# WMS purchase document workspace

Shared purchase inventory document UI for opening, ordinary, and entrusted inbound and return routes in WMS and SCM.

- `kind` selects the business name, permission prefix, default document type, date rule, return quantity treatment, and push targets.
- The workspace owns search, ArtTable rendering, row operations, import/export entry points, and the shared drawer.
- All reads and writes go through `src/api/wms-purchase.ts`; the component never accesses the transport client directly.
- Loading, empty, validation, permission, error, and success states use the existing Art and Element Plus feedback components.

## SCM purchase order to WMS inbound

- An approved SCM purchase order pushes selected lines into `scm_order_target_document` and `scm_order_target_line`. The purchase inbound page accepts a `targetId` route query or lets a user choose an unfinished target through **承接订单**.
- The drawer preloads the source supplier, project, material, purchase unit, price, and currently unreceived quantity. The user chooses the inventory organization, warehouse, bin, and project construction section before saving. The WMS line stores `source_order_target_line_id`; no direct edit of project or source ownership is used for transfer.
- `app_private.wms_validate_purchase_order_target_line` checks tenant, supplier, project, material, unit, gift flag, and per-line order quantity on insert or update. `wms_change_purchase_document_status_secure` locks source targets and lines, rejects cumulative approved receipts above the order quantity, posts the stock movement, then marks the target `partial` or `completed`.
- `wms_purchase_order_target_remaining(uuid)` is a security-invoker read RPC. It uses the existing tenant-scoped RLS and purchase-inbound view permission; the UI uses it only to prefill remaining quantity. Approval remains the authoritative concurrency check.
- The SCM target's project is nullable so ordinary non-project purchase orders can follow the same flow. Source links use a composite tenant foreign key and a matching index.

Database verification on 2026-09-26 used rollback transactions: a valid source link passed; a mismatched or over-quantity line was rejected; a one-unit partial receipt posted stock; a receipt beyond the cumulative order quantity was rejected; target status became `partial` and `completed` at the corresponding quantities; and the authenticated read RPC returned ordered 3, received 2, remaining 1. The read RPC also passed platform-all, platform-selected, ordinary-own, and ordinary forged cross-tenant header checks. Post-checks found no persisted synthetic test rows.
