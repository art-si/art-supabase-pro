import { mergeAttributes, Node } from '@tiptap/core'

const commonMediaAttributes = {
  src: { default: null },
  title: { default: null }
}

export const ArtVideo = Node.create({
  name: 'artVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...commonMediaAttributes,
      poster: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'video[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        preload: 'metadata'
      })
    ]
  }
})

export const ArtAudio = Node.create({
  name: 'artAudio',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return commonMediaAttributes
  },

  parseHTML() {
    return [{ tag: 'audio[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'audio',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        preload: 'metadata'
      })
    ]
  }
})

export const ArtFileAttachment = Node.create({
  name: 'artFileAttachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: null },
      name: {
        default: '附件',
        parseHTML: (element) => element.getAttribute('data-file-name') || element.textContent,
        renderHTML: (attributes) => ({ 'data-file-name': attributes.name })
      },
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-file-size'),
        renderHTML: (attributes) => (attributes.size ? { 'data-file-size': attributes.size } : {})
      },
      mimeType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-file-mime-type'),
        renderHTML: (attributes) =>
          attributes.mimeType ? { 'data-file-mime-type': attributes.mimeType } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="file-attachment"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const name = String(HTMLAttributes['data-file-name'] || '附件')
    const size = String(HTMLAttributes['data-file-size'] || '')
    const children: Array<string | [string, Record<string, string>, string]> = [
      ['span', { 'data-file-icon': 'true', 'aria-hidden': 'true' }, '↗'],
      ['span', { 'data-file-name': 'true' }, name]
    ]
    if (size) children.push(['span', { 'data-file-size': 'true' }, size])

    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'file-attachment',
        target: '_blank',
        rel: 'noopener noreferrer'
      }),
      ...children
    ]
  }
})
