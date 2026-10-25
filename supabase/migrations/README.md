# Database migrations

No migration SQL is kept here. The database delivery policy uses reviewed direct SQL execution.

To export the remote project's current schema, data, and migration history, run `supabase/backup-supabase.ps1` from the repository root. Its timestamped backup is ignored by Git and can be imported into a new project with `supabase/restore-supabase.ps1`.

Do not fetch historical migrations or create a baseline in this directory.
