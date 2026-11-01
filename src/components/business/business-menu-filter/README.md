# BusinessMenuFilter

Shared menu-tree search and selection for document numbering, workflow contracts and MDM type configuration.

The owning feature prepares its visible menu tree and supplies `count`, `directCount` and `searchTerms`. The panel uses `ArtSectionCard` for its title, fixed search/aggregate toolbar, bounded scrollbar, current-selection footer, and loading, empty and error/retry states. The scrollbar stays beside the card edge; content padding and the persistent bottom viewport inset belong to the shared card. Do not wrap the panel in another card or add a nested scrollbar. It does not load menus or decide permissions.

`data` and callbacks share the same generic `AppRouteRecord` subtype. `labels` contains the actual business copy; `summary` and `allCount` come from the owning domain. `icon` is optional for a domain whose directory classification differs from the default children-based folder icon.

Events:

- `select(menuId)`: a menu ID, or an empty string for the whole feature scope. Workflow adapters enrich it with their business types before emitting to the page.
- `refresh()`: the owner reloads its menu data.

Keep the parent height bounded and pass a concrete selected menu ID. The component never mutates the supplied tree. When tree data changes, it restores the current selection and reapplies the search term.

Inside an `ElDrawer`, the panel reuses the drawer surface without another border, radius or shadow. The shared card still owns its content spacing and scrolling.
