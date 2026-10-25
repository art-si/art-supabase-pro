# BusinessMenuFilter

Shared menu-tree search and selection for document numbering, workflow contracts and MDM type configuration.

The owning feature prepares its visible menu tree and supplies `count`, `directCount` and `searchTerms`. The panel owns the bounded scrollbar, search, current-node synchronization, aggregate selection, loading, empty and error/retry states. It does not load menus or decide permissions.

`data` and callbacks share the same generic `AppRouteRecord` subtype. `labels` contains the actual business copy; `summary` and `allCount` come from the owning domain. `icon` is optional for a domain whose directory classification differs from the default children-based folder icon.

Events:

- `select(menuId)`: a menu ID, or an empty string for the whole feature scope. Workflow adapters enrich it with their business types before emitting to the page.
- `refresh()`: the owner reloads its menu data.

Keep the parent height bounded and pass a concrete selected menu ID. The component never mutates the supplied tree. When tree data changes, it restores the current selection and reapplies the search term.
