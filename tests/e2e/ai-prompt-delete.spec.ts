import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const affected of [1, 0, null]) {
  test(`Prompt 草稿检查失败、取消与删除实际条数 affected=${affected}`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    let failInspection = true
    let deleted = false
    const events: string[] = []
    await page.route('**/rest/v1/ai_prompt_template?**', (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      if (method === 'DELETE') {
        events.push('delete')
        expect(url.searchParams.get('id')).toBe('eq.prompt-1')
        expect(url.searchParams.get('status')).toBe('eq.draft')
        expect(route.request().headers().prefer).toContain('count=exact')
        deleted = affected === 1
        return route.fulfill({
          headers:
            affected === null
              ? {}
              : {
                  'content-range': `*/${affected}`,
                  'access-control-expose-headers': 'content-range'
                },
          json: []
        })
      }
      const total = deleted ? 0 : 1
      if (method === 'HEAD') {
        const status = url.searchParams.get('status')
        const count = !status || status === 'eq.draft' ? total : 0
        return route.fulfill({
          headers: {
            'content-range': `*/${count}`,
            'access-control-expose-headers': 'content-range'
          },
          body: ''
        })
      }
      return route.fulfill({
        headers: {
          'content-range': total ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: deleted
          ? []
          : [
              {
                id: 'prompt-1',
                tenant_id: '00000000-0000-4000-8000-000000000002',
                feature: 'ocr',
                name: '测试删除版本',
                version: 'v1',
                system_prompt: '测试指令',
                status: 'draft',
                update_time: '2026-10-01T00:00:00Z'
              }
            ]
      })
    })
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'ai_prompt_template',
        p_ids: ['prompt-1']
      })
      return failInspection
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/ai-prompt-workspace.html')
    await expect(page.getByText('测试删除版本', { exact: true })).toBeVisible()
    const clickDelete = async () => {
      await page.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '删除草稿' }).click()
    }
    await clickDelete()
    await expect(page.getByRole('alert')).toContainText('关联资料未完成核验')
    await expect(page.locator('.el-message-box')).toHaveCount(0)
    expect(events).toEqual(['inspect'])
    await page.screenshot({
      path: testInfo.outputPath('prompt-delete-inspection.png'),
      fullPage: true,
      animations: 'disabled'
    })
    failInspection = false
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新检查', exact: true })).toHaveCount(0)
    await clickDelete()
    await expect(page.locator('.el-message-box')).toContainText('测试删除版本 · v1')
    await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
    expect(events).not.toContain('delete')
    await expect(page.getByText('测试删除版本', { exact: true })).toBeVisible()
    await clickDelete()
    await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
    await expect.poll(() => events.filter((event) => event === 'delete').length).toBe(1)
    if (affected) {
      await expect(page.getByText('测试删除版本', { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('业务概览').locator('strong')).toHaveText([
        '0 个',
        '0 个',
        '0 个',
        '0 个'
      ])
      expect(events).toEqual(['inspect', 'inspect', 'inspect', 'inspect', 'delete'])
    } else {
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: affected === null ? '删除结果未能确认' : '草稿未删除' })
      ).toHaveCount(1)
      await expect(page.getByRole('alert').filter({ hasText: '操作成功' })).toHaveCount(0)
      await expect.poll(() => events.filter((event) => event === 'inspect').length).toBe(5)
      await expect(page.getByText('测试删除版本', { exact: true })).toBeVisible()
    }
  })
}
