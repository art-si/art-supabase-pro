# Database migrations

No migration SQL is kept here. The database delivery policy uses reviewed direct SQL execution.

`supabase/config.toml` disables `[db.migrations]` so the Supabase GitHub integration skips automatic migration execution and history reconciliation. Keep the remote migration history intact; do not repair or delete it to match this intentionally empty directory.

After changing this setting, push the configuration and verify that the new Supabase deployment passes its migration step. Re-running an older commit still uses that commit's configuration.

To export the remote project's current schema, data, and migration history, run `supabase/backup-supabase.ps1` from the repository root. Its timestamped backup is ignored by Git and can be imported into a new project with `supabase/restore-supabase.ps1`.

Do not fetch historical migrations or create a baseline in this directory.
