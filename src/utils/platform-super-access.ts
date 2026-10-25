export interface PlatformSuperProfile {
  platformSuper?: boolean
}

/**
 * Trust only the server capability. Its authorization check verifies the authenticated
 * account, enabled platform-super role, active status, and platform tenant.
 */
export function hasPlatformSuperAccess(profile: PlatformSuperProfile): boolean {
  return profile.platformSuper === true
}
