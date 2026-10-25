import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const state of ['owned', 'hover', 'no-view', 'revoked', 'failed', 'clear']) {
  test(`工艺路线子记录删除保护 ${state}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const id = '11111111-1111-4111-8111-111111111101'
    let deletes = 0
    const checked = new Set<string>()
    await page.route('**/rest/v1/**', async (route) => {
      const table = new URL(route.request().url()).pathname.split('/').pop()!
      if (table === 'mdm_process_route') {
        if (route.request().method() === 'DELETE') deletes++
        if (
          route.request().method() === 'GET' &&
          new URL(route.request().url()).searchParams.get('id') === `eq.${id}`
        ) {
          if (state === 'revoked')
            await page.evaluate(async () => {
              const path = '/src/store/modules/menu.ts'
              const { useMenuStore } = await import(/* @vite-ignore */ path)
              const menu = useMenuStore()
              menu.setButtonList(
                menu.buttonList.filter(
                  (item: { name: string }) => item.name !== 'MdmProcessRoute:View'
                )
              )
            })
          return route.fulfill({
            json: [{ id, code: 'ROUTE-001', name: '测试工艺路线', enabled: true }]
          })
        }
        return route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json:
            deletes && route.request().method() !== 'DELETE'
              ? []
              : [
                  {
                    id,
                    code: 'ROUTE-001',
                    name: '测试工艺路线',
                    enabled: true,
                    tenant_id: '11111111-1111-4111-8111-111111111111'
                  }
                ]
        })
      }
      if (['mdm_process_route_step', 'mdm_process_route_sequence'].includes(table)) {
        checked.add(table)
        if (state === 'failed') return route.fulfill({ status: 500, json: { message: 'test' } })
        return route.fulfill({
          json: ['owned', 'hover', 'no-view', 'revoked'].includes(state)
            ? [
                {
                  id: `${table}-child`,
                  route_id: id,
                  code: 'STEP-001',
                  name: '测试路线工序',
                  sequence_no: 1,
                  create_time: '2026-10-01'
                }
              ]
            : []
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/master-group-reuse.html?mode=route')
    await expect(page.getByText('测试工艺路线', { exact: true })).toBeVisible()
    const more = page
      .locator('.el-table__body-wrapper')
      .getByRole('button', { name: '更多操作' })
      .first()
    if (state === 'hover') {
      expect(
        await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)
      ).toBe(true)
      await page.evaluate(() => {
        const events: string[] = []
        Object.assign(window, { moreHoverEvents: events })
        for (const type of [
          'pointerover',
          'pointerout',
          'mouseover',
          'mouseout',
          'mouseenter',
          'mouseleave'
        ]) {
          document.addEventListener(
            type,
            (event) => {
              if ((event.target as Element)?.closest?.('.art-button-more')) events.push(type)
            },
            true
          )
        }
      })
      await expect(
        more.locator('xpath=ancestor::div[contains(@class,"art-button-more")]')
      ).toHaveAttribute('data-trigger', 'hover')
      await more.hover()
      console.log(
        await more.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            events: Reflect.get(window, 'moreHoverEvents'),
            hovered: element.matches(':hover'),
            hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
              ?.outerHTML
          }
        })
      )
      await expect(more).toHaveAttribute('aria-expanded', 'true')
    } else await more.press('Enter')
    if (state === 'no-view')
      await page.evaluate(async () => {
        const path = '/src/store/modules/menu.ts'
        const { useMenuStore } = await import(/* @vite-ignore */ path)
        const menu = useMenuStore()
        menu.setButtonList(
          menu.buttonList.filter((item: { name: string }) => item.name !== 'MdmProcessRoute:View')
        )
      })
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
    if (state === 'clear') {
      await expect(confirmation).toBeVisible()
      expect([...checked].sort()).toEqual(['mdm_process_route_sequence', 'mdm_process_route_step'])
      await confirmation.getByRole('button', { name: '删除', exact: true }).click()
      await expect(page.getByText('工艺路线已删除', { exact: true })).toBeVisible()
      expect(deletes).toBe(1)
    } else {
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(confirmation).toHaveCount(0)
      expect(deletes).toBe(0)
      if (['owned', 'hover', 'no-view', 'revoked'].includes(state)) {
        await expect(page.getByRole('dialog')).toContainText('工艺路线序列')
        await expect(page.getByRole('dialog')).toContainText('工艺路线工序')
        await page.getByRole('dialog').screenshot({ path: info.outputPath('owned.png') })
        const destination = page.getByRole('button', { name: '查看所属路线', exact: true })
        if (state === 'no-view') await expect(destination).toHaveCount(0)
        else {
          await expect(destination).toHaveCount(2)
          await destination.first().click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          if (state === 'revoked') {
            await expect(
              page.getByText('查看权限已变化，请刷新页面后重试', { exact: true })
            ).toBeVisible()
            await expect(page.getByPlaceholder('编码 / 名称 / 版本 / 路径')).toHaveValue('')
          } else {
            await expect(page.getByPlaceholder('编码 / 名称 / 版本 / 路径')).toHaveValue(
              'ROUTE-001'
            )
          }
        }
      } else await expect(page.getByRole('dialog')).toHaveAccessibleName('删除检查未完成')
    }
  })
}
