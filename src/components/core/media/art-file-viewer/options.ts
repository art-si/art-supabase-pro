import type { FileViewerOptions } from '@file-viewer/vue3'

export const fileViewerOptions = {
  rendererMode: 'replace',
  toolbar: {
    position: 'bottom-right',
    zoom: true
  },
  text: {
    prettyPrint: false
  }
} satisfies FileViewerOptions
