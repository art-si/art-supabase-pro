import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatJsonWithGuides,
  parseJsonObjectDraft
} from '../../src/views/system/system-param/modules/json-param-editor'

test('field comments include types, choices and ranges, and apply as strict JSON', () => {
  const source = '{"globalFocusMode":false,"menuOpenWidth":230}'
  const draft = formatJsonWithGuides(source, {
    type: 'object',
    properties: {
      globalFocusMode: {
        type: 'boolean',
        description: '自动专注浏览',
        enum: [true, false]
      },
      menuOpenWidth: {
        type: 'number',
        description: '侧边菜单宽度',
        minimum: 180,
        maximum: 320
      }
    }
  })
  assert.match(draft, /\/\/ 自动专注浏览；可选值：true、false；类型：布尔值\n {2}"globalFocusMode"/)
  assert.match(draft, /\/\/ 侧边菜单宽度；范围：180–320；类型：数字\n {2}"menuOpenWidth"/)
  const parsed = parseJsonObjectDraft(draft)
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.value)), JSON.parse(source))
  assert.equal(parseJsonObjectDraft(JSON.stringify(parsed.value)).error, undefined)
})

test('nested known fields and unknown fields receive readable type comments', () => {
  const draft = formatJsonWithGuides(
    '{"authChannels":[{"key":"wechat","enabled":true}],"freeText":"hello"}',
    {
      type: 'object',
      properties: {
        authChannels: {
          type: 'array',
          description: '第三方渠道',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: '渠道键' },
              enabled: { type: 'boolean', description: '是否启用' }
            }
          }
        }
      }
    }
  )
  assert.match(draft, /\/\/ 第三方渠道；类型：数组/)
  assert.match(draft, /\/\/ 渠道键；类型：字符串/)
  assert.match(draft, /\/\/ 是否启用；可选值：true、false；类型：布尔值/)
  assert.match(draft, /\/\/ 自定义参数；类型：字符串/)
  assert.equal(parseJsonObjectDraft(draft).error, undefined)
})

test('boolean property schemas render without changing JSON values or schema references', () => {
  const schema = { type: 'object', properties: { allowed: true, forbidden: false } }
  const source = '{"allowed":true,"forbidden":false}'
  const draft = formatJsonWithGuides(source, schema)

  assert.deepEqual(
    JSON.parse(JSON.stringify(parseJsonObjectDraft(draft).value)),
    JSON.parse(source)
  )
  assert.deepEqual(schema.properties, { allowed: true, forbidden: false })
})

test('malformed JSONC and JavaScript expressions cannot be applied', () => {
  const invalid = [
    '{ // note\n "enabled": true, }',
    '{ "enabled": undefined }',
    '{ "enabled": getValue() }',
    '{ ...other }',
    '{ enabled: true }',
    '{ "enabled": true }; doSomething()'
  ]
  for (const source of invalid) assert.equal(parseJsonObjectDraft(source).error, 'syntax')
  assert.equal(parseJsonObjectDraft('[1, 2]').error, 'object')
  const parsed = parseJsonObjectDraft('{ // note\n "enabled": true }')
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.value)), { enabled: true })
})
