// Element Plus theme-chalk must receive the configured Sass variables before its
// own imports. Ordinary component styles only need the shared layout mixins.
export function withSharedScssGlobals(source, filename) {
  const normalizedFilename = filename.replace(/\\/g, '/')
  const needsElementTheme =
    normalizedFilename.includes('/element-plus/theme-chalk/') ||
    normalizedFilename.includes('/assets/styles/')
  return (
    (needsElementTheme ? '@use "@styles/core/el-light.scss" as elementTheme;\n' : '') +
    '@use "@styles/core/mixin.scss" as *;\n' +
    source
  )
}
