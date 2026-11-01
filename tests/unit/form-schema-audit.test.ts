import assert from 'node:assert/strict'
import test from 'node:test'
import { findNonSchemaFormFields, shouldAuditFormSchema } from '../../scripts/lib/form-schema-audit'

const scan = (template: string) =>
  findNonSchemaFormFields('fixture.vue', `<template>${template}</template>`)

test('login-related pages retain their explicitly requested layout exception', () => {
  assert.equal(shouldAuditFormSchema('src/views/auth/login/index.vue'), false)
  assert.equal(shouldAuditFormSchema('src/components/core/forms/art-form/index.vue'), false)
  assert.equal(shouldAuditFormSchema('src/views/system/website-config/index.vue'), true)
  assert.equal(shouldAuditFormSchema('modules/art-supabase-hr/src/views/form.vue'), true)
})
test('forms cannot bypass field schemas with raw form items or a custom layout', () => {
  assert.deepEqual(
    scan('<ArtForm custom-layout><ElFormItem><ElInput /></ElFormItem></ArtForm>').map(
      (item) => item.rule
    ),
    ['architecture/use-form-schema-layout', 'architecture/use-form-schema']
  )
  assert.equal(scan('<el-form><el-form-item /></el-form>').length, 2)
})
test('preset controls in direct field slots must use their configured type', () => {
  assert.equal(
    scan('<ArtForm :items="items"><template #name><ElInput /></template></ArtForm>')[0].rule,
    'architecture/use-form-preset'
  )
  assert.equal(
    scan('<ArtForm><template #file><art-upload-file /></template></ArtForm>')[0].rule,
    'architecture/use-form-preset'
  )
})
test('schema forms and composite widgets retain named slots and internal controls', () => {
  assert.deepEqual(scan('<ArtForm :items="items" />'), [])
  assert.deepEqual(
    scan(
      '<ArtForm :items="items"><template #lines><ArtTable><template #cell><ElInput /></template></ArtTable></template></ArtForm>'
    ),
    []
  )
  assert.deepEqual(
    scan('<ArtForm :items="items"><template #formula><FormulaEditor /></template></ArtForm>'),
    []
  )
})

test('preset render callbacks cannot bypass the configured field type', () => {
  const result = findNonSchemaFormFields(
    'fixture.vue',
    `<template><ArtForm :items="items" /></template><script setup lang="ts">
      const items = [
        { key: 'name', render: ElInput },
        { key: 'employee', render: () => h(ArtEmployeeSelect, {}) },
        { key: 'custom', render: () => h(CustomEditor, {}) },
        { key: 'empty', render: () => h() }
      ]
    </script>`
  )
  assert.deepEqual(
    result.map((item) => item.control),
    ['ElInput', 'ArtEmployeeSelect']
  )
})

test('simple layout wrappers cannot disguise preset fields, while editors retain their boundaries', () => {
  assert.equal(
    scan(
      '<ArtForm><template #color><div><ElColorPicker /><code>{{ color }}</code></div></template></ArtForm>'
    )[0].control,
    'ElColorPicker'
  )
  assert.deepEqual(
    scan(
      '<ArtForm><template #rows><div v-for="row in rows"><ElInput /></div></template></ArtForm>'
    ),
    []
  )
  assert.deepEqual(
    scan(
      '<ArtForm><template #lines><div><ArtTable><ElInput /></ArtTable></div></template></ArtForm>'
    ),
    []
  )
  assert.deepEqual(
    scan('<ArtForm><template #footer><div><ElInput /></div></template></ArtForm>'),
    []
  )
})
