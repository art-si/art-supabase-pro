import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { initAsyncCompiler } from 'sass-embedded'
import { withSharedScssGlobals } from '../../scripts/scss-globals.mjs'

test('focused Sass globals preserve rendered global, form and Element Plus styles', async () => {
  const compiler = await initAsyncCompiler()
  const legacyPrefix =
    '@use "@styles/core/el-light.scss" as elementTheme;\n@use "@styles/core/mixin.scss" as *;\n'
  try {
    for (const file of [
      'src/assets/styles/index.scss',
      'src/components/core/forms/art-form/style.scss',
      'node_modules/element-plus/theme-chalk/src/button.scss'
    ]) {
      const filename = path.resolve(file)
      const source = await readFile(filename, 'utf8')
      const options = {
        url: pathToFileURL(filename),
        style: 'compressed' as const,
        loadPaths: [path.resolve('node_modules')],
        importers: [
          {
            findFileUrl(url: string) {
              return url.startsWith('@styles/')
                ? pathToFileURL(path.resolve('src/assets/styles', url.slice('@styles/'.length)))
                : null
            }
          }
        ],
        quietDeps: true
      }
      const previous = await compiler.compileStringAsync(legacyPrefix + source, options)
      const current = await compiler.compileStringAsync(
        withSharedScssGlobals(source, filename),
        options
      )
      assert.equal(current.css, previous.css, file)
    }
  } finally {
    await compiler.dispose()
  }
})
