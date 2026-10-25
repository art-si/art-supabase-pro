// plugins/nojekyll.ts
import type { Plugin } from 'vite'

export function createNoJekyllPlugin(): Plugin {
  return {
    name: 'vite-plugin-nojekyll',
    apply: 'build',
    // Only the top-level build owns files in outDir. Worker closeBundle hooks
    // can otherwise recreate this file while Vite is emptying the directory.
    applyToEnvironment: (environment) => !environment.config.isWorker,
    /**
     * 构建完成时创建 .nojekyll 文件
     */
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' })
    }
  }
}
