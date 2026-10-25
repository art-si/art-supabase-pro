import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const kind of ['employee', 'material']) {
  for (const multiple of [false, true]) {
    test(`${kind} ${multiple ? '多选' : '单选'} 保留完整记录与零编号事件`, async ({
      page
    }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
      await page.goto(
        `/tests/e2e/fixtures/business-selector-contract.html?kind=${kind}${multiple ? '&multiple' : ''}${kind === 'material' && !multiple ? '&unresolved' : ''}`
      )
      if (kind === 'material' && !multiple)
        await expect(page.getByRole('textbox', { name: '打开物料记录' })).toHaveValue('not-loaded')
      await page
        .getByRole('textbox', { name: kind === 'employee' ? '打开员工记录' : '打开物料记录' })
        .click()
      const picker = page.getByRole('dialog', {
        name: kind === 'employee' ? '员工记录契约' : '物料记录契约',
        exact: true
      })
      const row = picker
        .getByRole('row')
        .filter({ hasText: kind === 'employee' ? 'EMP-0' : 'MAT-0' })
      await expect(row).toBeVisible()
      if (kind === 'employee') {
        expect(JSON.parse(await page.getByTestId('employee-range').innerText())).toMatchObject({
          tenantId: '11111111-1111-4111-8111-111111111111',
          from: 0,
          to: 9
        })
      }
      if (multiple) await row.locator('label.el-checkbox').click()
      else await row.click()
      await picker.getByRole('button', { name: /确.*定/ }).click()
      await expect(page.getByTestId('model')).toHaveText(multiple ? '["0"]' : '"0"')
      const events = JSON.parse(await page.getByTestId('events').innerText())
      for (const name of ['selected', 'change', 'confirm']) {
        const event = events.find((item: { name: string }) => item.name === name)
        expect(event).toMatchObject({
          name,
          rows: [{ id: '0', tenantId: '11111111-1111-4111-8111-111111111111' }],
          context: kind === 'employee' ? '研发组' : 7
        })
        if (name !== 'selected') expect(event.value).toEqual(multiple ? ['0'] : '0')
      }
      await page.screenshot({ path: info.outputPath('selected-record.png') })
      const clear = page.getByRole('button', { name: '清空', exact: true })
      const clearBounds = await clear.boundingBox()
      expect(clearBounds?.width).toBeGreaterThanOrEqual(24)
      expect(clearBounds?.height).toBeGreaterThanOrEqual(24)
      await clear.click()
      await expect(page.getByTestId('model')).toHaveText(multiple ? '[]' : '')
      const cleared = JSON.parse(await page.getByTestId('events').innerText())
      expect(cleared.findLast((item: { name: string }) => item.name === 'selected').rows).toEqual(
        []
      )
      expect(errors).toEqual([])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
    })
  }
}
