import { uniq } from 'lodash-es'
import { normalizeNullableText, normalizeStringList } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export type UiDesignReferenceSurfaceKind =
  'workspace' | 'detail' | 'form' | 'dashboard' | 'configuration' | 'other'

export type UiDesignReferenceStyleSnapshot = Record<
  string,
  string | number | boolean | null | string[]
>

export interface UiDesignReferenceRecord {
  id: string
  routeName: string
  routePathPattern: string
  pageTitle: string
  surfaceKind: UiDesignReferenceSurfaceKind
  preferenceTags: string[]
  note: string | null
  styleSnapshot: UiDesignReferenceStyleSnapshot
  sourceRevision: string | null
  createTime: string
  updateTime: string
}

export interface UiDesignReferenceImageRecord {
  id: string
  referenceId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sortOrder: number
  signedUrl: string
  createTime: string
}

export interface SaveUiDesignReferencePayload {
  id?: string
  routeName: string
  routePathPattern: string
  pageTitle: string
  surfaceKind: UiDesignReferenceSurfaceKind
  preferenceTags?: readonly string[]
  note?: string | null
  styleSnapshot?: UiDesignReferenceStyleSnapshot
  sourceRevision?: string | null
}

const surfaceKinds = new Set<UiDesignReferenceSurfaceKind>([
  'workspace',
  'detail',
  'form',
  'dashboard',
  'configuration',
  'other'
])

const referenceSelect =
  'id,route_name,route_path_pattern,page_title,surface_kind,preference_tags,note,style_snapshot,source_revision,create_time,update_time'
const referenceImageSelect =
  'id,reference_id,storage_path,file_name,mime_type,size_bytes,sort_order,create_time'
const referenceImageBucket = 'ai-ui-design-reference'

export const UI_DESIGN_REFERENCE_IMAGE_LIMIT = 6
export const UI_DESIGN_REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const UI_DESIGN_REFERENCE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp'
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStyleSnapshot(value: unknown): UiDesignReferenceStyleSnapshot {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return true
      return Array.isArray(item) && item.every((entry) => typeof entry === 'string')
    })
  ) as UiDesignReferenceStyleSnapshot
}

function normalizeReference(value: unknown): UiDesignReferenceRecord | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.routeName !== 'string' ||
    typeof value.routePathPattern !== 'string' ||
    typeof value.pageTitle !== 'string' ||
    typeof value.surfaceKind !== 'string' ||
    !surfaceKinds.has(value.surfaceKind as UiDesignReferenceSurfaceKind) ||
    typeof value.createTime !== 'string' ||
    typeof value.updateTime !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    routeName: value.routeName,
    routePathPattern: value.routePathPattern,
    pageTitle: value.pageTitle,
    surfaceKind: value.surfaceKind as UiDesignReferenceSurfaceKind,
    preferenceTags: normalizeStringList(value.preferenceTags),
    note: typeof value.note === 'string' ? value.note : null,
    styleSnapshot: normalizeStyleSnapshot(value.styleSnapshot),
    sourceRevision: typeof value.sourceRevision === 'string' ? value.sourceRevision : null,
    createTime: value.createTime,
    updateTime: value.updateTime
  }
}

function normalizeReferenceImage(
  value: unknown,
  signedUrl = ''
): UiDesignReferenceImageRecord | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.referenceId !== 'string' ||
    typeof value.storagePath !== 'string' ||
    typeof value.fileName !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.sizeBytes !== 'number' ||
    typeof value.sortOrder !== 'number' ||
    typeof value.createTime !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    referenceId: value.referenceId,
    storagePath: value.storagePath,
    fileName: value.fileName,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    sortOrder: value.sortOrder,
    signedUrl,
    createTime: value.createTime
  }
}

function buildWritePayload(payload: SaveUiDesignReferencePayload) {
  return {
    route_name: payload.routeName.trim(),
    route_path_pattern: payload.routePathPattern.trim(),
    page_title: payload.pageTitle.trim(),
    surface_kind: payload.surfaceKind,
    preference_tags: uniq(normalizeStringList(payload.preferenceTags)).slice(0, 12),
    note: normalizeNullableText(payload.note),
    style_snapshot: normalizeStyleSnapshot(payload.styleSnapshot),
    source_revision: normalizeNullableText(payload.sourceRevision)
  }
}

export async function fetchUiDesignReference(
  routeName: string
): Promise<UiDesignReferenceRecord | null> {
  const { data } = await responseHandle<unknown>(
    () =>
      supabase
        .from('ai_ui_design_reference')
        .select(referenceSelect)
        .eq('route_name', routeName)
        .maybeSingle(),
    { breakReturn: true }
  )
  return normalizeReference(data)
}

export async function saveUiDesignReference(
  payload: SaveUiDesignReferencePayload
): Promise<UiDesignReferenceRecord> {
  const writePayload = buildWritePayload(payload)
  const query = payload.id
    ? supabase
        .from('ai_ui_design_reference')
        .update(writePayload)
        .eq('id', payload.id)
        .select(referenceSelect)
        .single()
    : supabase.from('ai_ui_design_reference').insert(writePayload).select(referenceSelect).single()

  const { data } = await responseHandle<unknown>(() => query, {
    breakReturn: true,
    showErrorMessage: true,
    requireAffected: Boolean(payload.id),
    noAffectedMessage: '设计参考已发生变化，请刷新页面后重试'
  })
  const reference = normalizeReference(data)
  if (!reference) throw new Error('设计参考保存后未返回有效结果')
  return reference
}

export async function fetchUiDesignReferenceImages(
  referenceId: string
): Promise<UiDesignReferenceImageRecord[]> {
  const { data } = await responseHandle<unknown[]>(
    () =>
      supabase
        .from('ai_ui_design_reference_image')
        .select(referenceImageSelect)
        .eq('reference_id', referenceId)
        .order('sort_order', { ascending: true })
        .order('create_time', { ascending: true }),
    { breakReturn: true }
  )
  const rows = (data ?? [])
    .map((item) => normalizeReferenceImage(item))
    .filter((item): item is UiDesignReferenceImageRecord => item !== null)
  if (rows.length === 0) return []

  const { data: signedUrls } = await responseHandle<Array<{ path: string; signedUrl: string }>>(
    () =>
      supabase.storage.from(referenceImageBucket).createSignedUrls(
        rows.map((item) => item.storagePath),
        60 * 60
      ),
    { breakReturn: true }
  )
  const signedUrlByPath = new Map(
    (signedUrls ?? []).map((item) => [item.path, item.signedUrl] as const)
  )
  return rows.map((item) => ({
    ...item,
    signedUrl: signedUrlByPath.get(item.storagePath) ?? ''
  }))
}

function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

export async function uploadUiDesignReferenceImage(
  referenceId: string,
  file: File,
  sortOrder: number
): Promise<UiDesignReferenceImageRecord> {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()
  if (userError || !user) throw userError ?? new Error('当前登录状态无效')

  const storagePath = `${user.id}/${referenceId}/${crypto.randomUUID()}.${getImageExtension(file.type)}`
  await responseHandle(
    () =>
      supabase.storage.from(referenceImageBucket).upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '参考图片上传失败，请稍后重试'
    }
  )

  try {
    const { data } = await responseHandle<unknown>(
      () =>
        supabase
          .from('ai_ui_design_reference_image')
          .insert({
            reference_id: referenceId,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            sort_order: sortOrder
          })
          .select(referenceImageSelect)
          .single(),
      {
        breakReturn: true,
        showErrorMessage: true,
        errorMessage: '参考图片记录保存失败，请稍后重试'
      }
    )
    const image = normalizeReferenceImage(data)
    if (!image) throw new Error('参考图片保存后未返回有效结果')

    const { data: signedData } = await responseHandle<{ signedUrl: string }>(
      () => supabase.storage.from(referenceImageBucket).createSignedUrl(storagePath, 60 * 60),
      { breakReturn: true }
    )
    return { ...image, signedUrl: signedData?.signedUrl ?? '' }
  } catch (error) {
    await supabase.storage.from(referenceImageBucket).remove([storagePath])
    throw error
  }
}

export async function removeUiDesignReferenceImage(
  image: Pick<UiDesignReferenceImageRecord, 'id' | 'storagePath'>
): Promise<{ storageCleanupFailed: boolean }> {
  await responseHandle(
    () =>
      supabase.from('ai_ui_design_reference_image').delete({ count: 'exact' }).eq('id', image.id),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: true,
      noAffectedMessage: '参考图片已被移除，无需重复操作'
    }
  )

  const { error } = await supabase.storage.from(referenceImageBucket).remove([image.storagePath])
  return { storageCleanupFailed: Boolean(error) }
}

export async function removeUiDesignReference(id: string): Promise<void> {
  const images = await fetchUiDesignReferenceImages(id)
  if (images.length > 0) {
    await responseHandle(
      () =>
        supabase.storage
          .from(referenceImageBucket)
          .remove(images.map((image) => image.storagePath)),
      {
        breakReturn: true,
        showErrorMessage: true,
        errorMessage: '参考图片清理失败，暂未取消设计参考'
      }
    )
  }

  await responseHandle(
    () => supabase.from('ai_ui_design_reference').delete({ count: 'exact' }).eq('id', id),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: true,
      noAffectedMessage: '设计参考已被取消，无需重复操作'
    }
  )
}
