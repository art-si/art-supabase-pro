# Shared Component Placement

Shared components are organized by responsibility, not by the page that first needs them. Search the closest existing category before adding a directory, and do not use `layouts` or `others` as catch-all locations.

## `core`: domain-independent UI infrastructure

| Directory | Responsibility | Examples |
| --- | --- | --- |
| `core/base` | Small dependency-light display and interaction primitives | icon buttons, copy text, badges |
| `core/forms` | Inputs, selectors, form composition, and validation-aware controls | `ArtForm`, data selectors, upload controls |
| `core/feedback` | Loading, skeleton, empty, error, permission, and status feedback | `ArtAsyncState`, `ArtEmptyState`, `ArtPermissionGuard` |
| `core/surfaces` | Reusable visual containers and section chrome | `ArtSectionCard`, `ArtSectionTitle` |
| `core/layouts` | Application shell, page geometry, navigation, and structural flow | page shell, page section, menu, header, timeline |
| `core/tables` | Table rendering, querying, pagination, and table tooling | `ArtTable`, `ArtTableQuery` |
| `core/dialogs` | Generic modal containers and dialog infrastructure | `ArtDialog` |
| `core/drawers` | Generic drawer containers and drawer infrastructure | `ArtDrawer` |
| `core/media` | Image, file-preview, audio, and other media presentation | image cropper, preview controls |
| `core/charts` | Domain-independent chart wrappers | chart containers and chart primitives |
| `core/theme` | Theme-aware UI controls and visual tokens exposed as components | theme controls |
| `core/views` | Framework-level reusable view shells, not business feature pages | exception or framework view infrastructure |
| `core/widget` | Small framework widgets that do not fit a business domain | reusable utility widgets |

`core/others` is legacy only. Do not add a new component there. Move a legacy component only when it is already being materially refactored and the move can be verified without broad unrelated churn.

`ArtButtonMore` adapts its default trigger to the device: touch devices use click, while devices with hover use hover. Set `trigger` explicitly only when the interaction requires an override; business pages should reuse this behavior rather than implement their own mobile dropdown.

### Overlay lifecycle

`ArtDialog` and `ArtDrawer` share `useArtOverlay`. Unmounting invalidates pending open, confirm, and close continuations and clears local loading state. It does not invoke business `onClose` or `onReset` callbacks. Retained APIs cannot reopen or reset an unmounted instance. Requests already started by a business callback remain owned by that business layer; their server outcome must be reconciled when the page is next loaded.

`ArtScreenLock` owns workspace lock isolation through a native modal dialog. Business portals stay mounted to preserve drafts while the rest of the document is inert; pages should reuse this policy without adding local lock overlays, z-index rules, or keyboard traps. Unlocking and component teardown close the native modal before removal to restore the previous input focus.

`ArtGlobalComponent` owns deferred activation of search, settings, chat, and fireworks. A pending load retains the latest activation and reports a failure once. Cached components must actually mount before activation is replayed, including activation in the same update as unlocking. Locking or unmounting invalidates older intents; business pages should emit the existing activation events rather than add their own loader or replay policy.

## Cross-repository import paths

Business modules under `modules/**` also build against a pinned, separately distributed `art-supabase-pro` package. A shared component's source path is therefore part of their integration contract. Before relocating one, verify that the pinned platform package contains the new path, update every module import and dependency pin together, and run the standalone module typechecks. `ArtIconButton` currently stays under `core/widget/art-icon-button` for this reason.

## `business`: shared domain-aware components

Use `src/components/business` for components reused across pages that understand business records or call exported `src/api/**` functions. They may compose `core` components but must not access transport clients directly.

Examples:

- `MasterGroupPanel`: shared group navigation, filtering, async states, and permission-aware management actions. Pair it with `ArtWorkspaceSplitter` using a 900px breakpoint and `stacked-primary-size="auto"`; narrow screens reuse its collapsible summary rather than page-local fixed-height group regions. See [the component contract](business/master-group-panel/README.md).
- `ArtEmployeeSelect`: tenant-scoped employee lookup and employee identity display. `allowAllTenantRead` enables aggregate search only for platform super administrators in the all-tenant scope; write targets still come from the owning form. `displayFields` can include `gender` and `age` when the authorized source supplies these fields, such as accident employee snapshots; the selector preserves the source records when emitting selections.
- `ArtEmployeeSelect` and `ArtMaterialSelect` configure the same `ArtDataSelect` table workspace directly. Employee events retain `EmployeeIntegrationItem`; material events infer the complete record type from `apiFn` and `selectedData`, including domain-specific fields. Their `change` values are strings for single selection and string arrays for multiple selection. Reuse these record types in callbacks instead of converting generic rows with assertions or adding DTO index signatures.
- `BusinessWorkspaceHeader`: shared business workspace identity and overview metrics.
- `BusinessAttachmentRowActions`: attachment preview/download actions with shared row spacing. The caller supplies its authorized `removable` state and handles the `remove` event; the component does not delete or persist records.
- `BusinessMenuFilter`: menu-tree search, selection, counts and complete states; each feature supplies its own visible menus and business statistics.
- Business record links, history, and permission-aware action surfaces.

An employee selector belongs in `business`, not `core/forms`, because it depends on the employee domain and its API contract. A generic paged table selector remains in `core/forms`.

## Page-local components

Keep a component under `src/views/<domain>/<feature>/modules` when it is only meaningful to one feature, depends on that feature's workflow state, or would expose a domain-specific API that no other page consumes.

Promote it only after a real second use or when the platform deliberately establishes a shared contract.

## Placement decision

Before creating a component, decide in this order:

1. Is it page-specific? Keep it in the feature's `modules` directory.
2. Is it shared but domain-aware or API-backed? Put it in `components/business`.
3. Is it domain-independent? Place it in the matching `components/core/<responsibility>` directory.
4. If no category fits, document the missing responsibility before adding a new top-level category. Do not default to `layouts` or `others`.

Each reusable component keeps its `README.md`, public types, usage contract, and complete loading/empty/error behavior beside the implementation.

## Component names

Keep explicit `defineOptions({ name })` names in PascalCase and unique across the host and all business repositories. A route entry owns the route's component name; its reusable implementation uses a distinct responsibility name such as `MdmOutboundRuleWorkspace`. Keep permission codes tied to the business route. `pnpm ui:audit` checks static component names across repositories and rejects duplicates or invalid names. Missing source directories in optional repositories are skipped; failures while reading existing module sources must fail the audit.
