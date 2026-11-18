import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { installDictionaryOptions } from './dictionary-options'
import { prepareIsolatedSession } from './isolated-session'
import { mockApplicationMenus } from './menu-rpc'

export async function prepareScmDocumentSession(page: Page, menus: readonly unknown[]) {
  const tenant = await prepareIsolatedSession(page, {
    tenantId: randomUUID(),
    platformSuper: false
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [{ code: 'scm', name: '测试供应链', description: null, baseUrl: '/scm/', sort: 1 }]
    })
  )
  await mockApplicationMenus(page, { scm: menus })
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ],
    scmLoadingOutboundStatus: [
      { value: 'all', label: '全部' },
      { value: 'pending', label: '未出库' },
      { value: 'partial', label: '部分出库' },
      { value: 'complete', label: '已全出库' }
    ]
  })
  return tenant
}

export const scmLoadingOutboundPath = '/scm/sales-management/loading-outbound'

export function prepareScmLoadingOutboundSession(page: Page, access: 'read' | 'issue' = 'read') {
  const menu = {
    id: 'loading-outbound',
    parentId: null,
    name: 'ScmLoadingOutbound',
    path: scmLoadingOutboundPath,
    component: scmLoadingOutboundPath,
    type: 'menu',
    sort: 1,
    meta: { title: '装车出库', is_enable: true, is_hide: false, roles: [] }
  }
  const permissions = [
    'ScmLoadingOutbound:View',
    ...(access === 'issue' ? ['ScmLoadingOutbound:Issue', 'WmsStockOperation:Issue'] : [])
  ]
  return prepareScmDocumentSession(page, [
    menu,
    ...permissions.map((name, index) => ({
      ...menu,
      id: `loading-outbound-${index}`,
      parentId: menu.id,
      name,
      path: '',
      component: '',
      type: 'button'
    }))
  ])
}
