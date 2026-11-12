import { useSupabase } from '@/hooks/core/useSupabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import { uniq } from 'lodash-es'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const NOTE_SELECT = 'id,user_id,content,content_text,images,tags,created_at,updated_at'
const SIGNED_URL_TTL = 60 * 60

type NoteItem = Api.Notes.NoteItem
type NoteAuthor = Api.Notes.Author

interface NoteRow {
  id: string
  userId: string
  content: string
  contentText: string | null
  images: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface NoteAuthorRow extends NoteAuthor {
  tenant?: { tenantName?: string | null } | null
}

const normalizeTags = (tags: string[]): string[] =>
  uniq(tags.map((tag) => normalizeNonNullableText(tag).slice(0, 40)).filter(Boolean)).slice(0, 8)

async function signImageUrls(rows: NoteRow[]): Promise<Map<string, string>> {
  const paths = uniq(rows.flatMap((row) => row.images).filter(Boolean))
  if (!paths.length) return new Map()

  const { data } = await responseHandle<Array<{ path: string; signedUrl: string }>>(
    () => supabase.storage.from('note-images').createSignedUrls(paths, SIGNED_URL_TTL),
    { showErrorMessage: false, errorMessage: '笔记图片加载失败，请稍后重试' }
  )
  return new Map((data ?? []).map((item) => [item.path, item.signedUrl]))
}

async function loadAuthors(userIds: string[]): Promise<Map<string, NoteAuthor>> {
  const ids = uniq(userIds).filter(Boolean)
  if (!ids.length) return new Map()

  const { data } = await responseHandle<NoteAuthorRow[]>(
    () =>
      supabase
        .from('sys_user')
        .select('auth_user_id,user_name,nick_name,avatar,tenant:sys_tenant(tenant_name)')
        .in('auth_user_id', ids),
    { showErrorMessage: false, errorMessage: '笔记作者信息加载失败，请稍后重试' }
  )

  return new Map(
    (data ?? [])
      .filter((item) => Boolean(item.authUserId))
      .map((item) => [
        item.authUserId,
        {
          authUserId: item.authUserId,
          userName: item.userName,
          nickName: item.nickName,
          avatar: item.avatar,
          tenantName: item.tenant?.tenantName ?? null
        }
      ])
  )
}

function mapRows(
  rows: NoteRow[],
  authors: Map<string, NoteAuthor>,
  imageUrls: Map<string, string>
) {
  return rows.map<NoteItem>((row) => ({
    ...row,
    contentText: row.contentText ?? '',
    imageUrls: row.images
      .map((path) => imageUrls.get(path))
      .filter((url): url is string => Boolean(url)),
    author: authors.get(row.userId) ?? null
  }))
}

export async function fetchNoteList(params: Api.Notes.NoteListParams) {
  const { keyword = '', dateRange, from = 0, to = 19 } = params
  let query = supabase
    .from('notes')
    .select(NOTE_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  const trimmedKeyword = normalizeNonNullableText(keyword)
  if (trimmedKeyword)
    query = query.or(buildOrIlikeFilter(['content_text', 'content'], trimmedKeyword))
  if (dateRange?.[0]) query = query.gte('created_at', `${dateRange[0]}T00:00:00+08:00`)
  if (dateRange?.[1]) query = query.lte('created_at', `${dateRange[1]}T23:59:59.999+08:00`)

  const result = await responseHandle<NoteRow[]>(() => query, {
    showErrorMessage: true,
    errorMessage: '时光笔记加载失败，请刷新后重试'
  })
  const rows = result.data ?? []
  const [authors, imageUrls] = await Promise.all([
    loadAuthors(rows.map((row) => row.userId)),
    signImageUrls(rows)
  ])
  return {
    data: mapRows(rows, authors, imageUrls),
    total: result.total ?? 0,
    error: result.error
  }
}

export async function fetchNoteStats(): Promise<{
  data: Api.Notes.NoteStats
  error: unknown | null
}> {
  const result = await responseHandle<Pick<NoteRow, 'id' | 'userId' | 'images' | 'createdAt'>[]>(
    () => supabase.from('notes').select('id,user_id,images,created_at'),
    {
      showErrorMessage: false,
      errorMessage: '笔记概览加载失败，请刷新后重试'
    }
  )
  const rows = result.data ?? []
  const recentSince = Date.now() - 7 * 24 * 60 * 60 * 1000
  return {
    data: {
      total: rows.length,
      users: new Set(rows.map((row) => row.userId)).size,
      recent: rows.filter((row) => new Date(row.createdAt).getTime() >= recentSince).length,
      withImages: rows.filter((row) => row.images.length > 0).length,
      lastCreatedAt: rows
        .map((row) => row.createdAt)
        .sort()
        .at(-1)
    },
    error: result.error
  }
}

export async function addNote(payload: Api.Notes.NotePayload): Promise<void> {
  await responseHandle(
    () =>
      supabase.from('notes').insert({
        content: normalizeNonNullableText(payload.content),
        tags: normalizeTags(payload.tags),
        images: payload.images ?? []
      }),
    {
      showMessage: true,
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '笔记创建失败，请检查权限后重试'
    }
  )
}

export async function editNote(payload: Api.Notes.NotePayload): Promise<void> {
  if (!payload.id) throw new Error('笔记标识缺失，请刷新列表后重试')
  const { id, ...rest } = payload
  await responseHandle(
    () =>
      supabase
        .from('notes')
        .update(
          keysToSnakeDeep({
            ...rest,
            content: normalizeNonNullableText(rest.content),
            tags: normalizeTags(rest.tags)
          }),
          {
            count: 'exact'
          }
        )
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      showErrorMessage: true,
      errorMessage: '笔记保存失败，请检查权限后重试',
      noAffectedMessage: '笔记不存在或当前账号没有维护权限，请刷新后重试'
    }
  )
}

export async function deleteNote(id: string): Promise<void> {
  await responseHandle(() => supabase.from('notes').delete({ count: 'exact' }).eq('id', id), {
    breakReturn: true,
    requireAffected: true,
    showErrorMessage: true,
    errorMessage: '笔记删除失败，请检查权限后重试',
    noAffectedMessage: '笔记不存在或当前账号没有删除权限，请刷新后重试',
    showReferenceFeedback: false
  })
}
