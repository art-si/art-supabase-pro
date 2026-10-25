import { isAbsolute, relative } from 'node:path'

export function normalizeBuildBase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`
}

export function extractBuildBase(indexHtml: string): string {
  const assetReference = indexHtml.match(/(?:href|src)=["']([^"']*?\/assets\/)/i)?.[1]
  if (!assetReference) return '/'

  try {
    const pathname = new URL(assetReference, 'http://localhost').pathname
    return normalizeBuildBase(pathname.slice(0, -'/assets/'.length))
  } catch {
    return '/'
  }
}

export function stripBuildBase(pathname: string, buildBase: string): string {
  if (buildBase === '/' || !pathname.startsWith(buildBase)) return pathname
  return `/${pathname.slice(buildBase.length)}`
}

export function isPathWithinRoot(rootDirectory: string, candidatePath: string): boolean {
  const relativePath = relative(rootDirectory, candidatePath).replaceAll('\\', '/')
  return relativePath !== '..' && !relativePath.startsWith('../') && !isAbsolute(relativePath)
}

export function isAssetPath(relativePath: string): boolean {
  return relativePath.replaceAll('\\', '/').startsWith('assets/')
}
