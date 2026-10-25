import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface PublishedAiPrompt {
  content: string
  version: string
  source: 'database' | 'fallback'
}

interface AiPromptTemplateRow {
  version: string
  system_prompt: string
}

function normalizedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function loadPublishedAiPrompt(
  admin: SupabaseClient,
  tenantId: string,
  feature: string,
  fallback: { content: string; version: string }
): Promise<PublishedAiPrompt> {
  const { data, error } = await admin
    .from('ai_prompt_template')
    .select('version,system_prompt')
    .eq('tenant_id', tenantId)
    .eq('feature', feature)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.warn('Published AI prompt lookup failed; using code fallback', feature, error.message)
    return { ...fallback, source: 'fallback' }
  }

  const row = data as AiPromptTemplateRow | null
  const content = normalizedText(row?.system_prompt)
  const version = normalizedText(row?.version)
  if (!content || !version) return { ...fallback, source: 'fallback' }

  return { content, version, source: 'database' }
}
