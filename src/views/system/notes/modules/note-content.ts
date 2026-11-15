import DOMPurify from 'dompurify'
import { uniq } from 'lodash-es'

const editorPathAttr = 'data-storage-path'
const storedPathAttr = 'data-note-image'

function parseContent(html: string): HTMLTemplateElement {
  const template = document.createElement('template')
  template.innerHTML = html
  return template
}

function createImage(path: string, signedUrl?: string): HTMLImageElement {
  const image = document.createElement('img')
  image.setAttribute(editorPathAttr, path)
  if (signedUrl) image.src = signedUrl
  image.alt = signedUrl ? '笔记图片' : '图片暂不可用'
  return image
}

/** Mobile uses the path array. The HTML markers retain image placement for rich-text readers. */
export function hydrateNoteContent(
  html: string,
  paths: string[],
  signedUrls: ReadonlyMap<string, string>
): string {
  const template = parseContent(DOMPurify.sanitize(html))
  const pending = new Set(paths)
  for (const marker of template.content.querySelectorAll(`span[${storedPathAttr}]`)) {
    const path = marker.getAttribute(storedPathAttr)
    if (path && paths.includes(path)) {
      marker.replaceWith(createImage(path, signedUrls.get(path)))
      pending.delete(path)
    } else {
      marker.remove()
    }
  }
  for (const path of pending) template.content.append(createImage(path, signedUrls.get(path)))
  return template.innerHTML
}

export function refreshNoteImageSources(
  html: string,
  signedUrls: ReadonlyMap<string, string>
): string {
  const template = parseContent(html)
  for (const image of template.content.querySelectorAll<HTMLImageElement>(
    `img[${editorPathAttr}]`
  )) {
    const path = image.getAttribute(editorPathAttr)
    const signedUrl = path && signedUrls.get(path)
    if (signedUrl) {
      image.src = signedUrl
      image.alt = '笔记图片'
    }
  }
  return template.innerHTML
}

export function getNoteImageKeys(html: string): string[] {
  return uniq(
    Array.from(
      parseContent(html).content.querySelectorAll(`img[${editorPathAttr}]`),
      (image) => image.getAttribute(editorPathAttr) ?? ''
    ).filter(Boolean)
  )
}

export function serializeNoteContent(
  html: string,
  pathsByKey: ReadonlyMap<string, string>
): string {
  const template = parseContent(html)
  for (const image of template.content.querySelectorAll(`img[${editorPathAttr}]`)) {
    const key = image.getAttribute(editorPathAttr)
    const path = key && pathsByKey.get(key)
    if (path) {
      const marker = document.createElement('span')
      marker.setAttribute(storedPathAttr, path)
      image.replaceWith(marker)
    } else {
      image.remove()
    }
  }
  return DOMPurify.sanitize(template.innerHTML)
}
