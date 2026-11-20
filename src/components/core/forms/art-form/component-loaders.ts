import type { Component } from 'vue'

const artComponentSources = {
  cascader: '../art-cascader/index.vue',
  iconPicker: '../art-icon-picker/index.vue',
  tagStyleSelect: '../art-tag-style-select/index.vue',
  dataSelect: '../art-data-select/index.vue',
  userSelect: '../art-user-select/index.vue',
  employeeSelect: '../../../business/art-employee-select/index.vue',
  uploadFile: '../art-upload-file/index.vue',
  uploadImage: '../art-upload-image/index.vue',
  signature: '../art-signature-pad/index.vue'
} as const

export type ArtComponentType = keyof typeof artComponentSources

// Vite requires literal patterns; both maps target the concrete component entry.
const components = import.meta.glob<Component>(
  [
    '../art-{cascader,icon-picker,tag-style-select,data-select,user-select,upload-file,upload-image,signature-pad}/index.vue',
    '../../../business/art-employee-select/index.vue'
  ],
  { import: 'default' }
)
const retryComponents = import.meta.glob<Component>(
  [
    '../art-{cascader,icon-picker,tag-style-select,data-select,user-select,upload-file,upload-image,signature-pad}/index.vue',
    '../../../business/art-employee-select/index.vue'
  ],
  { import: 'default', query: '?form-controls-retry' }
)

export const isArtComponentType = (type: string): type is ArtComponentType =>
  Object.hasOwn(artComponentSources, type)

export const loadArtComponent = (type: ArtComponentType, retry: boolean): Promise<Component> =>
  (retry ? retryComponents : components)[artComponentSources[type]]()
