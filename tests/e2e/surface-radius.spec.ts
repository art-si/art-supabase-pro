import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const dark of [false, true]) {
  for (const box of ['border-mode', 'shadow-mode']) {
    for (const width of [1440, 390]) {
      test(`交互背景跟随系统圆角 ${dark ? 'dark' : 'light'} ${box} ${width}`, async ({
        page
      }, info) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await prepareIsolatedSession(page)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/tests/e2e/fixtures/surface-radius.html')
        await page.evaluate(
          ({ dark, box }) => {
            document.documentElement.classList.toggle('dark', dark)
            document.documentElement.dataset.boxMode = box
          },
          { dark, box }
        )
        const icon = page.getByRole('button', { name: '全屏', exact: true })
        const surfaces = [
          icon,
          page.getByRole('button', { name: '加载中', exact: true }),
          page.getByRole('button', { name: '禁用操作', exact: true }),
          page.getByRole('button', { name: '查看记录', exact: true }),
          page.getByRole('button', { name: '编辑器工具', exact: true }),
          page.getByRole('menuitem', { name: '当前菜单', exact: true }),
          page.getByRole('menuitem', { name: '悬停菜单', exact: true }),
          page.locator('.el-sub-menu__title'),
          page.locator('section').last().locator('.el-tree-node__content'),
          page.locator('.el-input__wrapper').first(),
          page.locator('.el-select__wrapper').last(),
          page.getByRole('button', { name: '打开 Popover', exact: true }),
          page.locator('section').first()
        ]
        for (const radius of ['0', '0.25', '0.75', '1']) {
          await page.getByLabel('系统圆角').selectOption(radius)
          const px = `${Number(radius) * 16}px`
          for (const surface of surfaces) {
            await expect(surface).toHaveCSS('border-top-left-radius', px)
            await expect(surface).toHaveCSS('border-bottom-right-radius', px)
          }
          await icon.hover()
          await expect(icon).toHaveCSS('border-top-left-radius', px)
          await icon.focus()
          await expect(icon).toBeFocused()
          await expect(icon).toHaveCSS('border-top-left-radius', px)
          await page.getByRole('menuitem', { name: '悬停菜单', exact: true }).hover()
          await page.getByRole('button', { name: '更多操作', exact: true }).click()
          const option = page.getByRole('menuitem', { name: '查看详情', exact: true })
          await option.hover()
          await expect(option).toHaveCSS('border-top-left-radius', px)
          await expect(page.getByRole('menuitem', { name: '禁用菜单' })).toHaveCSS(
            'border-top-left-radius',
            px
          )
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: '右键菜单', exact: true }).click()
          const contextItem = page
            .locator('.menu-right')
            .getByRole('menuitem', { name: '查看记录', exact: true })
          await contextItem.hover()
          await expect(contextItem).toHaveCSS('border-top-left-radius', px)
          await page.locator('.menu-right').getByRole('menuitem', { name: '子菜单目录' }).hover()
          await expect(page.getByRole('menuitem', { name: '子菜单操作' })).toHaveCSS(
            'border-top-left-radius',
            px
          )
          await icon.click()
          await page.locator('.el-select__wrapper').last().click()
          await expect(page.locator('.radius-preview-select.el-popper')).toBeVisible()
          await expect(page.locator('.radius-preview-select.el-popper')).toHaveCSS(
            'border-top-left-radius',
            px
          )
          await expect(page.getByRole('option', { name: '在职', exact: true })).toHaveCSS(
            'border-top-left-radius',
            px
          )
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: '打开 Popover', exact: true }).click()
          await expect(page.locator('.radius-preview-popover')).toBeVisible()
          await expect(page.locator('.radius-preview-popover')).toHaveCSS(
            'border-top-left-radius',
            px
          )
          await icon.click()
          await page.getByRole('button', { name: '打开弹窗', exact: true }).click()
          await expect(page.locator('.el-dialog')).toHaveCSS('border-top-left-radius', px)
          await page.keyboard.press('Escape')
        }
        await expect(page.getByRole('button', { name: '禁用操作', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: '加载中', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: '圆形按钮' })).toHaveCSS(
          'border-top-left-radius',
          '50%'
        )
        await page.getByLabel('系统圆角').selectOption('0.75')
        await icon.hover()
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        expect(errors).toEqual([])
        await page.screenshot({ path: info.outputPath('surface-radius.png') })
        await page.reload()
        await expect(page.getByLabel('系统圆角')).toHaveValue('0.75')
        await expect(icon).toHaveCSS('border-top-left-radius', '12px')
      })
    }
  }
}

for (const dark of [false, true]) {
  test(`TreeSelect 与级联浮层选项的实际 hover ${dark ? 'dark' : 'light'}`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    await page.goto('/tests/e2e/fixtures/surface-radius.html')
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = 'border-mode'
    }, dark)
    for (const radius of ['0', '0.75', '1']) {
      await page.getByLabel('系统圆角').selectOption(radius)
      const px = `${Number(radius) * 16}px`
      await page.getByTestId('tree-select').locator('.el-select__wrapper').click()
      const tree = page.locator('.el-popper.el-tree-select__popper.radius-preview-tree')
      const row = tree.locator('.el-tree-node__content').filter({ hasText: '组件示例' }).first()
      await row.hover()
      await expect(tree).toHaveCSS('border-top-left-radius', px)
      await expect(row).toHaveCSS('border-top-left-radius', px)
      await expect(row).toHaveCSS('border-bottom-right-radius', px)
      await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      if (radius === '0.75')
        await page.screenshot({ path: info.outputPath('tree-select-hover.png') })
      await page.keyboard.press('Escape')
      await page.getByTestId('cascader').locator('.el-input__wrapper').click()
      const cascader = page.locator('.el-cascader__dropdown.radius-preview-cascader')
      const option = cascader.getByRole('menuitem', { name: '人事管理' })
      await option.hover()
      await expect(cascader).toHaveCSS('border-top-left-radius', px)
      await expect(option).toHaveCSS('border-top-left-radius', px)
      await expect(option).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
      await page.locator('.el-select__wrapper').last().click()
      const selectOption = page.getByRole('option', { name: '在职', exact: true })
      await selectOption.hover()
      await expect(selectOption).toHaveCSS('border-top-left-radius', px)
      await expect(selectOption).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
    }
  })
}
