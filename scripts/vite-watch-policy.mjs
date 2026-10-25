/** Keep generated reports and build output outside the development file watcher. */
export function createViteWatchPolicy(outDir) {
  return {
    // pnpm 子模块链接可能指回宿主或其他工作区，不能沿链接重复建立监听器。
    followSymlinks: false,
    ignored: [
      '**/node_modules/**',
      '**/node_modules.*/**',
      '**/.git/**',
      '**/.artifacts/**',
      '**/.codex/**',
      '**/.idea/**',
      '**/playwright-report/**',
      '**/test-results/**',
      `**/${outDir}/**`,
      '**/dist/**',
      '**/dist-ssr/**'
    ]
  }
}
