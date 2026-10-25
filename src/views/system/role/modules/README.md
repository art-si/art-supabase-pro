# Role dialogs

`role-permission-dialog.vue` owns the permission draft and uses `ArtDialog` for its lifecycle and submit loading. The parent opens it with a role record; it must not construct or save a separate permission draft.

## Safety and state contract

- Menu catalog and current-role grants load together. Editing/saving requires both reads to succeed and a nonempty catalog to be mounted. A read failure or empty catalog must never be interpreted as a request to clear existing grants.
- An intentionally empty selection is valid **after** a nonempty catalog has loaded successfully.
- Each load has an identity tied to the open role. Opening, closing, resetting, and unmounting invalidate prior results. Check that identity after every asynchronous boundary, including Vue render ticks and debounced searches; old work must not change checked keys, readiness, loading, or scroll position.
- This is result isolation, not transport cancellation. Outstanding API calls may still complete; their results cannot replace the active draft.
- A pending save freezes the draft and blocks ordinary close/reopen actions. The payload captures the role ID and selection before awaiting the provider. A failed save preserves the draft and allows retry. Route-driven forced closure must not let the old save close a later dialog.
- Frontend readiness is not authorization. Existing `System:Role:AssignPermission` and server-side `set_role_menus` access checks remain authoritative.

## Tree and layout contract

- The dialog reserves a bounded content height. Only the virtual tree owns tree scrolling; the observed viewport uses `flex: 1; min-height: 0` and must not grow with the virtual list's total height.
- `TREE_ROW_HEIGHT` and rendered node height must agree. Do not derive the viewport height from the virtual list's own scroll height.
- Search keeps the tree mounted so selected permissions survive no-match results. Clearing search restores manual expansion. Bulk expansion is unavailable during search; bulk selection explicitly affects all permissions, not just matches.
- “全部收起” collapses all nodes. Search/reset and reopen reset scroll position without changing the draft unexpectedly.
- “父级联动下级” is an action aid, not a selection-normalization mode. Enabling or disabling it preserves the exact current draft. While enabled, a subsequent user check or uncheck on a parent applies only that action to its descendants; unrelated interactions must not recalculate historical grants.
- A checked descendant renders unselected ancestors as half checked. Half-checked ancestors are navigation paths, not direct role grants, and must not be added to the save payload. A directly checked parent stays checked even when some descendants are unchecked.
- Long role identities and permission codes retain full text through titles; narrow screens move the selected-count summary to its own row.

## Verification

`tests/e2e/role-permission-state.spec.ts` uses the actual page, dialog, providers, and virtual tree with controlled identity/menu responses and 1,601 synthetic permission nodes. It intercepts **all** permission saves, testing success, failure, empty catalog, retry, deliberate empty selection, late success/failure, save-in-flight protection, search, collapse, scrolling, and reopen without changing real grants.

`tests/e2e/role-permission-virtual-tree.spec.ts` separately verifies bounded scrolling against the live read-only integration. Run its authentication setup when the persisted session may be expired.

These tests verify the UI lifecycle, not the database's complete authorization matrix or all other dialogs. Continue auditing other features separately; do not infer repository-wide safety from this module's green checks.
