import type { Component } from 'vue'

/** Only the platform host bundles the complete platform business route catalog. */
export function loadPlatformHostRouteModules() {
  return import.meta.glob<{ default: Component }>([
    '../../views/**/*.vue',
    '!../../views/**/modules/**/*.vue',
    '!../../views/**/components/**/*.vue'
  ])
}
