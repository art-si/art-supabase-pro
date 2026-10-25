import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** Keep source Sass style entries out of JavaScript dependency optimization. */
export function getElementPlusStyleDeps(root) {
  const componentsDir = path.resolve(root, 'node_modules/element-plus/es/components')
  if (!existsSync(componentsDir)) return []

  return readdirSync(componentsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(path.join(componentsDir, entry.name, 'style/index.mjs'))
    )
    .map((entry) => `element-plus/es/components/${entry.name}/style/index`)
    .sort()
}

// Common controls share one initial stylesheet; less-used controls keep their route CSS.
const sharedElementPlusStyleComponents = new Set([
  'alert',
  'avatar',
  'badge',
  'base',
  'button',
  'calendar',
  'card',
  'checkbox',
  'checkbox-button',
  'col',
  'collapse',
  'collapse-transition',
  'dialog',
  'date-picker',
  'date-picker-panel',
  'descriptions',
  'dropdown',
  'form',
  'icon',
  'image',
  'input',
  'input-number',
  'message',
  'overlay',
  'pagination',
  'popconfirm',
  'popover',
  'progress',
  'radio',
  'radio-button',
  'radio-group',
  'result',
  'row',
  'scrollbar',
  'segmented',
  'select',
  'select-v2',
  'slider',
  'skeleton',
  'space',
  'splitter',
  'switch',
  'table',
  'tag',
  'tabs',
  'text',
  'time-picker',
  'time-select',
  'timeline',
  'timeline-item',
  'tooltip',
  'tree-select',
  'upload'
])

/** @param {string} id */
export const matchElementPlusStyles = (id) => {
  const normalizedId = id.replace(/\\/g, '/')
  const match = normalizedId.match(/\/node_modules\/element-plus\/es\/components\/([^/]+)\/style\//)
  return match !== null && sharedElementPlusStyleComponents.has(match[1])
}
