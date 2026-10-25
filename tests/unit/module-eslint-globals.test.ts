import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { ESLint } from 'eslint'

test('standalone HR lint resolves workspace auto imports and still rejects unknown globals', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../modules/art-supabase-hr', import.meta.url))
  })
  const [result] = await eslint.lintText(
    '<script setup lang="ts">\nconst value = ref(1)\nvoid value\nmissingRuntimeSymbol()\n</script>\n',
    { filePath: 'src/views/quality-probe.vue' }
  )
  const undefinedNames = result.messages.filter((message) => message.ruleId === 'no-undef')
  assert.equal(undefinedNames.length, 1)
  assert.match(undefinedNames[0].message, /missingRuntimeSymbol/)
})
