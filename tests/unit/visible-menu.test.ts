import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppRouteRecord } from '../../src/types/router'
import { filterVisibleMenuItems, getFirstMenuPath } from '../../src/utils/navigation/route'

const page = (name: string, extra: Partial<AppRouteRecord> = {}): AppRouteRecord => ({
  name,
  path: `/${name}`,
  component: `/${name}`,
  meta: { title: name },
  ...extra
})

test('visible menu preserves accessible parents while removing hidden children and empty directories', () => {
  const hidden = page('hidden', { meta: { title: 'hidden', isHide: true } })
  const parent = page('parent', { children: [hidden] })
  const empty = page('empty', { component: '', children: [hidden] })
  const nested = page('group', {
    component: '',
    children: [
      page('child-group', {
        component: '',
        children: [page('leaf'), empty]
      })
    ]
  })
  const input = [parent, empty, nested, hidden]
  const before = structuredClone(input)
  const output = filterVisibleMenuItems(input)
  assert.deepEqual(
    output.map((item) => item.name),
    ['parent', 'group']
  )
  assert.deepEqual(output[0].children, [])
  assert.deepEqual(
    output[1].children?.[0].children?.map((item) => item.name),
    ['leaf']
  )
  assert.deepEqual(input, before)
  assert.notEqual(output[0], parent)
})

test('visible menu retains external and iframe pages but does not expose hidden full-screen pages', () => {
  const fullscreen = page('fullscreen', {
    meta: { title: 'fullscreen', isHide: true, isFullPage: true }
  })
  const external = page('external', {
    path: '',
    component: '',
    meta: { title: 'external', link: 'https://example.com' }
  })
  const iframe = page('iframe', { component: '', meta: { title: 'iframe', isIframe: true } })
  assert.deepEqual(
    filterVisibleMenuItems([external, iframe, fullscreen]).map((item) => item.name),
    ['external', 'iframe']
  )
  assert.equal(getFirstMenuPath([fullscreen]), '/fullscreen')
})

test('visible menu removes invalid leaves and prunes hidden parents together with their children', () => {
  assert.deepEqual(
    filterVisibleMenuItems([
      page('missing-component', { component: '' }),
      page('blank-path', { path: ' ' }),
      page('hidden-parent', {
        meta: { title: 'hidden-parent', isHide: true },
        children: [page('leaf')]
      })
    ]),
    []
  )
})
