import { useSupabase } from '@/hooks/core/useSupabase'
import { applyCreateTimeRange, type SupabaseQueryLike } from '@/api/providers/supabase/query'

type Artifact = Api.IntelligentRecognition.RecognitionArtifact
type SearchParams = Api.IntelligentRecognition.ArtifactSearchParams
type Overview = Api.IntelligentRecognition.RecognitionOverview

const { supabase, responseHandle } = useSupabase()

const ARTIFACT_SELECT = `
  *,
  run:ai_run!ai_artifact_review_ai_run_id_fkey(
    id,
    model,
    status,
    latency_ms,
    error_code,
    error_message,
    metadata,
    started_at,
    finished_at
  )
`

function applyArtifactFilters<TQuery extends SupabaseQueryLike>(
  query: TQuery,
  params: SearchParams
): TQuery {
  if (params.artifactId) query = query.eq('id', params.artifactId)
  if (params.feature) query = query.eq('feature', params.feature)
  if (params.status) query = query.eq('status', params.status)
  if (params.creator) query = query.ilike('create_by', `%${params.creator.trim()}%`)
  if (params.confidenceLevel === 'low') query = query.lt('confidence', 0.65)
  if (params.confidenceLevel === 'medium') {
    query = query.gte('confidence', 0.65).lt('confidence', 0.85)
  }
  if (params.confidenceLevel === 'high') query = query.gte('confidence', 0.85)
  return applyCreateTimeRange(query, params.createTimeRange)
}

export async function fetchRecognitionArtifactList(params: SearchParams) {
  const { from = 0, to = 9 } = params
  let query = supabase
    .from('ai_artifact_review')
    .select(ARTIFACT_SELECT, { count: 'exact' })
    .in('feature', [
      'invoice_ocr',
      'waybill_receipt_ocr',
      'cash_voucher_ocr',
      'waybill_expense_ocr'
    ])
  if (params.sort === 'risk') {
    query = query.order('confidence', { ascending: true, nullsFirst: true })
  }
  query = query.order('create_time', { ascending: false }).range(from, to)
  const filterableQuery = query
  const filteredQuery = applyArtifactFilters(filterableQuery, params)
  return await responseHandle<Artifact[]>(() => filteredQuery, {
    showErrorMessage: true
  })
}

export async function fetchRecognitionArtifactDetail(id: string) {
  return await responseHandle<Artifact>(
    () => supabase.from('ai_artifact_review').select(ARTIFACT_SELECT).eq('id', id).single(),
    { showErrorMessage: true }
  )
}

export async function fetchRecognitionOverview() {
  return await responseHandle<Overview>(() => supabase.rpc('ai_ocr_recognition_overview'), {
    showErrorMessage: true,
    convertToCamelShadow: true
  })
}
