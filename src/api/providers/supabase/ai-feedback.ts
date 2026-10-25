import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export type AiFeedbackRating = -1 | 1
export type AiFeedbackIssueType =
  'incorrect' | 'incomplete' | 'irrelevant' | 'unsafe' | 'slow' | 'data_quality' | 'other'

export interface AiFeedbackCorrection {
  schemaVersion: 1
  issueType?: AiFeedbackIssueType | null
  correctAnswer?: string | null
  contextLabel?: string | null
}

export interface AiFeedbackRecord {
  id: number
  runId: string
  rating: AiFeedbackRating
  comment?: string | null
  correction: AiFeedbackCorrection
  createTime: string
  updateTime: string
}

export interface SubmitAiFeedbackPayload {
  runId: string
  rating: AiFeedbackRating
  comment?: string | null
  issueType?: AiFeedbackIssueType | null
  correctAnswer?: string | null
  contextLabel?: string | null
}

const feedbackSelect = 'id,run_id,rating,comment,correction,create_time,update_time'

export async function fetchAiFeedback(runId: string): Promise<AiFeedbackRecord | null> {
  const { data } = await responseHandle<AiFeedbackRecord | null>(
    () => supabase.from('ai_feedback').select(feedbackSelect).eq('run_id', runId).maybeSingle(),
    { breakReturn: true }
  )
  return data ?? null
}

export async function submitAiFeedback(
  payload: SubmitAiFeedbackPayload
): Promise<AiFeedbackRecord> {
  const correction: AiFeedbackCorrection = {
    schemaVersion: 1,
    issueType: payload.issueType ?? null,
    correctAnswer: normalizeNullableText(payload.correctAnswer),
    contextLabel: normalizeNullableText(payload.contextLabel)
  }
  const { data } = await responseHandle<AiFeedbackRecord>(
    () =>
      supabase
        .from('ai_feedback')
        .upsert(
          {
            run_id: payload.runId,
            rating: payload.rating,
            comment: normalizeNullableText(payload.comment),
            correction
          },
          { onConflict: 'run_id,auth_user_id' }
        )
        .select(feedbackSelect)
        .single(),
    { breakReturn: true, showErrorMessage: true }
  )
  if (!data) throw new Error('AI 反馈提交后未返回结果')
  return data
}
