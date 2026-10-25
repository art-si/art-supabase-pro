import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_ATTACHMENT_PREFIX = '/storage/v1/object/public/attachments/'

export function isValidAttachmentTenantId(tenantId: string | null): tenantId is string {
  return tenantId !== null && UUID_PATTERN.test(tenantId)
}

export function areAttachmentImageUrlsInTenant(
  imageUrls: string[],
  supabaseUrl: string,
  tenantId: string
): boolean {
  if (!imageUrls.length || !isValidAttachmentTenantId(tenantId)) return false
  let expectedOrigin: string
  try {
    expectedOrigin = new URL(supabaseUrl).origin
  } catch {
    return false
  }
  return imageUrls.every((value) => {
    try {
      const url = new URL(value)
      if (
        url.origin !== expectedOrigin ||
        url.username ||
        url.password ||
        url.hash ||
        !url.pathname.startsWith(PUBLIC_ATTACHMENT_PREFIX)
      ) {
        return false
      }
      const objectPath = url.pathname.slice(PUBLIC_ATTACHMENT_PREFIX.length)
      const separator = objectPath.indexOf('/')
      if (separator < 1 || separator === objectPath.length - 1) return false
      return objectPath.slice(0, separator) === tenantId
    } catch {
      return false
    }
  })
}

/** Root OCR work in platform-all defaults to the actor's tenant; a concrete selection is explicit. */
export function resolveAttachmentOcrTenantId(params: {
  isPlatformSuper: boolean
  requestedTenantId: string | null
  actorTenantId: string
  imageUrls: string[]
  supabaseUrl: string
}): string | null {
  const tenantId = params.isPlatformSuper
    ? params.requestedTenantId ?? params.actorTenantId
    : params.actorTenantId
  if (!isValidAttachmentTenantId(tenantId)) return null
  return areAttachmentImageUrlsInTenant(params.imageUrls, params.supabaseUrl, tenantId)
    ? tenantId
    : null
}

export async function authorizeAttachmentOcrImages(params: {
  userClient: SupabaseClient
  appUser: { tenant_id: string }
  imageUrls: string[]
  requestedTenantId: string | null
  supabaseUrl: string
}): Promise<false | { tenantId: string }> {
  const { data: isPlatformSuper, error } = await params.userClient.rpc('current_is_super')
  if (error || typeof isPlatformSuper !== 'boolean') return false
  const tenantId = resolveAttachmentOcrTenantId({
    isPlatformSuper,
    requestedTenantId: params.requestedTenantId,
    actorTenantId: params.appUser.tenant_id,
    imageUrls: params.imageUrls,
    supabaseUrl: params.supabaseUrl
  })
  return tenantId ? { tenantId } : false
}

/** An OCR review targets the existing artifact, including in platform-all. */
export function canReviewAiArtifactTenant(params: {
  isPlatformSuper: boolean
  requestedTenantId: string | null
  actorTenantId: string
  artifactTenantId: string
}): boolean {
  if (!isValidAttachmentTenantId(params.artifactTenantId)) return false
  if (!params.isPlatformSuper) return params.artifactTenantId === params.actorTenantId
  if (!params.requestedTenantId) return true
  return (
    isValidAttachmentTenantId(params.requestedTenantId) &&
    params.artifactTenantId === params.requestedTenantId
  )
}

export async function authorizeAiArtifactReview(params: {
  userClient: SupabaseClient
  appUser: { tenant_id: string }
  requestedTenantId: string | null
  artifactTenantId: string
}): Promise<boolean> {
  const { data: isPlatformSuper, error } = await params.userClient.rpc('current_is_super')
  return (
    !error &&
    typeof isPlatformSuper === 'boolean' &&
    canReviewAiArtifactTenant({
      isPlatformSuper,
      requestedTenantId: params.requestedTenantId,
      actorTenantId: params.appUser.tenant_id,
      artifactTenantId: params.artifactTenantId
    })
  )
}

