import type { BuildOptions } from 'vite'

export interface BuildLogLike {
  message?: string
}

export function getKnownFileViewerExternalization(log: BuildLogLike): string | null

export interface BuildLogPolicy {
  chunkSizeWarningLimit: number
  rolldownOptions: {
    onLog: NonNullable<NonNullable<BuildOptions['rolldownOptions']>['onLog']>
    checks: {
      invalidAnnotation: false
      pluginTimings: false
    }
  }
  summaryPlugin: {
    name: string
    apply: 'build'
    closeBundle(): void
  }
}

export function createBuildLogPolicy(): BuildLogPolicy
