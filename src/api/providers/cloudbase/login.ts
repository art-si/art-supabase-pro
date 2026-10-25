import { getFriendlySupabaseErrorMessage } from '../../../utils/supabase/error'

interface MigrationResult {
  data: { ok?: boolean; code?: string; message?: string } | null
  error: unknown
}

const MIGRATABLE_CODES = new Set([
  'password_not_set',
  'invalid_username_or_password',
  'invalid_credentials'
])

/** Retry legacy credentials only for identity/password failures, never rate limits or service errors. */
export async function signInWithCloudBaseMigration<T extends { error: unknown }>(
  signIn: () => Promise<T>,
  migrate: () => Promise<MigrationResult>
): Promise<T> {
  const initial = await signIn()
  const error = initial.error
  if (!error || typeof error !== 'object' || !('code' in error)) return initial
  if (typeof error.code !== 'string' || !MIGRATABLE_CODES.has(error.code.toLowerCase()))
    return initial

  let migration: MigrationResult
  try {
    migration = await migrate()
  } catch (migrationError) {
    migration = { data: null, error: migrationError }
  }
  if (migration.error || migration.data?.ok !== true) {
    // Keep the actionable primary Auth reason, with migration diagnostics available as cause.
    throw new Error(getFriendlySupabaseErrorMessage(error, '登录失败，请稍后重试'), {
      cause: { error, cause: migration.error ?? migration.data }
    })
  }
  return signIn()
}
