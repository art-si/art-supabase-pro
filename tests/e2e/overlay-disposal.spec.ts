import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
for (const kind of ['dialog', 'drawer']) {
  for (const phase of ['open', 'confirm', 'close']) {
    test(`${kind} 卸载取消 ${phase} 的旧反馈且新实例可以正常使用`, async ({ page }) => {
      await prepareIsolatedSession(page)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(`/tests/e2e/fixtures/overlay-disposal.html?kind=${kind}&phase=${phase}`)
      await page.getByRole('button', { name: '打开待处理草稿', exact: true }).click()
      const panel = page.getByRole('dialog', { name: '公共弹层卸载验收', exact: true })
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('textbox', { name: '草稿备注' })).toHaveValue('保留草稿内容')
      if (phase !== 'open')
        await page
          .getByRole('button', { name: phase === 'confirm' ? '请求确认' : '请求关闭', exact: true })
          .click()
      await expect(page.getByLabel('回调次数')).toHaveText('1')
      await page.getByRole('button', { name: '切换挂载', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await page.getByRole('button', { name: '结束旧请求', exact: true }).click()
      if (phase === 'open') await expect(page.getByLabel('打开完成次数')).toHaveText('1')
      await page.getByRole('button', { name: '调用旧实例', exact: true }).click()
      await expect(page.getByLabel('旧实例数据')).toHaveText('待处理草稿')
      await expect(page.getByLabel('回调次数')).toHaveText('1')
      await expect(page.getByLabel('错误次数')).toHaveText('0')
      await expect(page.getByLabel('重置次数')).toHaveText('0')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByRole('button', { name: '切换挂载', exact: true }).click()
      await page.getByRole('button', { name: '打开新草稿', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '新草稿', exact: true })).toBeVisible()
      await expect(page.getByText('新草稿', { exact: true })).toHaveCount(2)
      await page.screenshot({ path: test.info().outputPath('remounted-overlay.png') })
      await page.getByRole('button', { name: '请求确认', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '新草稿', exact: true })).toBeVisible()
      await expect(page.getByLabel('错误次数')).toHaveText('0')
      expect(pageErrors).toEqual([])
    })
  }
}
