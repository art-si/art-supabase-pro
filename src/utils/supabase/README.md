# Supabase shared boundaries

- `filters.ts`: typed single-column SDK filters and field-name conversion.
- `search.ts`: `buildOrIlikeFilter(columns, keyword)` for multi-column text search. Column names must come from application configuration. It quotes values according to PostgREST grammar, escapes quotes/backslashes, and leaves URL encoding to the SDK. It preserves the existing LIKE wildcard semantics (`%`, `_`, `*`); it is not a literal-match or authorization helper. Keep tenant, lifecycle, date, and permission constraints separate.
- `pagination.ts`: collect bounded range pages without returning a partial result after an error.
- `error.ts`: shared Chinese error normalization; do not show raw provider messages.
- `session.ts` / `functions.ts`: session recovery and Edge Function transport.

Do not interpolate user keywords into `.or()` or remove punctuation to make a query parse. Use the shared search function from API providers, not from business views. Simple equality/range filters should continue to use SDK methods rather than raw filter strings.

Regression coverage: `tests/unit/supabase-search.test.ts` checks escaping, identifier validation and SDK encoding; `tests/e2e/postgrest-search.spec.ts` exercises the real project parser using authenticated read-only HEAD requests and a sanitized parameter-page search. Run the latter with its login setup dependency so the persisted session is fresh.
