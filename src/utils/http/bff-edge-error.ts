import { FunctionsHttpError } from '@supabase/supabase-js'

/** Supabase returns an Error instance whose HTTP Response lives on context. */
export function bffFunctionHttpResponse(error: unknown): Response | null {
  return error instanceof FunctionsHttpError && error.context instanceof Response
    ? error.context
    : null
}
