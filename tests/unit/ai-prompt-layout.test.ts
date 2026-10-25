import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workspaceSources = [
  {
    name: 'AI Prompt',
    path: 'src/views/system/ai-prompt/index.vue',
    rootClass: 'ai-prompt'
  },
  {
    name: 'AI configuration',
    path: 'src/views/system/ai-configuration/index.vue',
    rootClass: 'ai-configuration'
  },
  {
    name: 'system parameters',
    path: 'src/views/system/system-param/index.vue',
    rootClass: 'system-param-page'
  }
]

for (const workspace of workspaceSources) {
  test(`keeps the ${workspace.name} table in a bounded full-height flex workspace`, () => {
    const source = readFileSync(workspace.path, 'utf8')
    assert.match(source, /business-workspace-page art-full-height/)
    assert.match(source, /density="compact"/)
    assert.match(
      source,
      new RegExp(
        `\\.${workspace.rootClass}\\s*\\{\\s*display:\\s*flex;\\s*flex-direction:\\s*column;`
      )
    )
    assert.doesNotMatch(source, new RegExp(`\\.${workspace.rootClass}\\s*\\{\\s*display:\\s*grid;`))
  })
}

test('keeps the approval workbench tab pane height chain intact', () => {
  const source = readFileSync('src/views/workflow/workbench/index.vue', 'utf8')
  assert.match(
    source,
    /&__workspace\s*\{\s*display:\s*flex;\s*flex:\s*1;\s*flex-direction:\s*column;/
  )
  assert.match(source, /&__tabs\s*\{\s*display:\s*flex;\s*flex:\s*1;\s*flex-direction:\s*column;/)
  assert.match(source, /&__tabs :deep\(\.el-tabs__content\)\s*\{\s*flex:\s*1;/)
  assert.match(
    source,
    /&__tabs :deep\(\.el-tab-pane\)\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*height:\s*100%;/
  )
})
