import type { Component } from 'vue'

/** Standalone applications register their own routes and retain the shared shell catalog. */
export function loadPlatformHostRouteModules(): Record<
  string,
  () => Promise<{ default: Component }>
> {
  return {}
}
