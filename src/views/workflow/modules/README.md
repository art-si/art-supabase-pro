# Workflow feature modules

`workflow-analytics-panel.vue` owns the read-only operational and bottleneck analysis UI for both `/workflow/analytics` and the monitor's analytics dialog. It stays within the workflow feature because its data contracts and labels are workflow-specific.

## Analytics lifecycle

- Mounting loads the default 30-day period. The dialog's `destroy-on-close` remounts a fresh panel on the next opening.
- Period changes use VueUse `useAsyncState`: only the latest execution updates results, errors, and loading state. Do not assign results through `onSuccess`, which runs for stale executions too.
- Both analytics responses must complete before the result is exportable. Loading, errors, or a result from a different period disable export; the export handler repeats this guard.
- The panel owns inline normalized errors and retry. API calls remain in `src/api/workflow.ts`; no new database privileges or mutation capabilities are introduced.
- No SLA sample is shown as `—`, not 100%. Daily zero counts have zero-height bars. Node/approver lists grow naturally until their bounded scrollbar limit rather than reserving a large empty region for a single row.

Regression coverage: `tests/e2e/workflow-analytics.spec.ts` checks direct navigation, out-of-order responses, loading/export gating, retry/empty states, dialog reopen, and narrow-width layout. Use sanitized fixtures for screenshots.
