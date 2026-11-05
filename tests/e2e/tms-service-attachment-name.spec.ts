import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const caseId = '88888888-8888-4888-8888-888888888888'
const fileUrls = [
  `https://example.invalid/storage/v1/object/public/attachments/${tenantId}/hash-a.txt`,
  `https://example.invalid/storage/v1/object/public/attachments/${tenantId}/hash-b.png`
]

test('沟通记录按同租户附件元数据展示原文件名', async ({ page }) => {
  const attachmentQueries: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'tms_service_case')
      return route.fulfill({
        json: [
          {
            id: caseId,
            tenant_id: tenantId,
            service_no: 'FW-2026-ATTACH',
            organization_name: '验收运输公司',
            service_type: 'complaint',
            complaint_types: [],
            title: '附件回显验收',
            waybill_id: null,
            waybill_no: null,
            contact_name: '测试联系人',
            contact_phone: '',
            content: '检查文件名称',
            attachments: [],
            status: 'pending',
            submitted_at: '2026-11-02T08:00:00Z',
            submitted_by: '测试用户',
            create_by: '测试用户',
            create_time: '2026-11-02T08:00:00Z'
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    if (endpoint === 'tms_service_case_reply')
      return route.fulfill({
        json: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            tenant_id: tenantId,
            service_case_id: caseId,
            reply_to_id: null,
            content: '已上传合成图片和文本',
            attachments: fileUrls,
            mentions: [],
            author_user_id: '99999999-9999-4999-8999-999999999999',
            author_name: '测试用户',
            create_time: '2026-11-02T08:20:00Z'
          }
        ]
      })
    if (endpoint === 'sys_attachment') {
      attachmentQueries.push(url.searchParams.get('tenant_id') ?? '')
      return route.fulfill({
        json: [
          { url: fileUrls[0], origin_name: 'tms-service-test.txt' },
          { url: fileUrls[1], origin_name: 'tms-service-test.png' }
        ]
      })
    }
    if (endpoint === 'tms_list_service_case_mention_targets_secure')
      return route.fulfill({ json: { users: [], organizations: [], roles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=service-detail')
  await page.getByRole('button', { name: 'FW-2026-ATTACH' }).click()
  await page.getByRole('tab', { name: '沟通记录' }).click()
  await expect(page.getByRole('link', { name: 'tms-service-test.txt' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'tms-service-test.png' })).toBeVisible()
  await expect(page.getByText('hash-a.txt')).toHaveCount(0)
  expect(attachmentQueries).toContain(`eq.${tenantId}`)
})
