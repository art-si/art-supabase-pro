import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function sampleAssignee(dialog: Locator, loaded: boolean) {
  return dialog.evaluate((root, loaded) => {
    const form = root.querySelector('.art-form')
    const field = form?.querySelector('[data-art-form-item-key="assigneeUserId"]')
    const content = field?.querySelector('.art-form-item__content')
    const nativeContent = field?.querySelector('.el-form-item__content')
    const label = field?.querySelector('.el-form-item__label')
    const control = field?.querySelector(loaded ? '.art-user-select' : '.art-async-state')
    const wrapper = control?.querySelector(
      loaded ? '.el-select__wrapper' : '.art-form-control-skeleton, .el-skeleton'
    )
    const reason = form?.querySelector<HTMLTextAreaElement>(
      '[data-art-form-item-key="reason"] textarea'
    )
    const followingLabel = form?.querySelector(
      '[data-art-form-item-key="reason"] .el-form-item__label'
    )
    const scroll = root.querySelector('.art-dialog__scrollbar > .el-scrollbar__wrap')
    const footer = root.querySelector('.art-dialog__footer-actions')
    if (
      !form ||
      !content ||
      !nativeContent ||
      !label ||
      !control ||
      !wrapper ||
      !reason ||
      !followingLabel ||
      !scroll ||
      !footer
    )
      throw new Error('审批转交的真实表单布局尚未就绪')
    const bounds = (element: Element) => {
      const { x, y, width, height, bottom } = element.getBoundingClientRect()
      return { x, y, width, height, bottom }
    }
    const visible = (element: Element, container?: Element) => {
      const rect = element.getBoundingClientRect()
      const clip = container?.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= Math.max(0, clip?.left ?? 0) - 1 &&
        rect.right <= Math.min(innerWidth, clip?.right ?? innerWidth) + 1 &&
        rect.top >= Math.max(0, clip?.top ?? 0) - 1 &&
        rect.bottom <= Math.min(innerHeight, clip?.bottom ?? innerHeight) + 1
      )
    }
    return {
      form: bounds(form),
      content: bounds(content),
      nativeContent: bounds(nativeContent),
      label: bounds(label),
      control: bounds(control),
      wrapper: bounds(wrapper),
      followingLabel: bounds(followingLabel),
      footer: bounds(footer),
      scroll: {
        top: scroll.scrollTop,
        left: scroll.scrollLeft,
        height: scroll.scrollHeight,
        client: scroll.clientHeight,
        width: scroll.scrollWidth,
        clientWidth: scroll.clientWidth
      },
      visible: {
        control: visible(control, scroll),
        followingLabel: visible(followingLabel, scroll),
        actions: [...footer.querySelectorAll('button')].map((button) => ({
          text: button.textContent?.trim(),
          visible: visible(button)
        }))
      },
      overflow: {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: root.scrollWidth - root.clientWidth
      },
      reason: reason.value,
      summary: root.querySelector('.workflow-transfer__summary')?.textContent?.trim()
    }
  }, loaded)
}

for (const profile of [
  { width: 1440, height: 1000, theme: 'light', boxBorderMode: false },
  { width: 390, height: 844, theme: 'dark', boxBorderMode: true }
] as const) {
  test(`真实审批人控件加载几何 ${profile.width}/${profile.theme}`, async ({ page }, info) => {
    test.setTimeout(180_000)
    const held: Route[] = [],
      requests: string[] = [],
      reads: { method: string; path: string; payload: unknown }[] = [],
      writes: string[] = [],
      errors: string[] = [],
      warnings: string[] = []
    await page.setViewportSize({ width: profile.width, height: profile.height })
    await prepareAppearance(page, profile)
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
          message.text()
        )
      )
        warnings.push(message.text())
    })
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      if (path.endsWith('/rpc/list_workflow_user_options_secure')) {
        reads.push({ method: request.method(), path, payload: request.postDataJSON() })
        return route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json: [
            {
              id: 'next-user',
              user_name: '审核员 B',
              nick_name: '审核员 B',
              user_email: 'test@example.invalid'
            }
          ]
        })
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        writes.push(`${request.method()} ${path}`)
        return route.fulfill({ status: 403, json: { message: '隔离测试阻止写入' } })
      }
      return route.fulfill({ json: [] })
    })
    const scriptPath = '/src/components/core/forms/art-user-select/index.vue'
    await page.route('**/src/components/core/forms/art-user-select/index.vue*', (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (
        request.resourceType() !== 'script' ||
        url.pathname !== scriptPath ||
        url.searchParams.has('vue')
      )
        return route.continue()
      requests.push(url.pathname + url.search)
      held.push(route)
    })
    try {
      await page.goto('/tests/e2e/fixtures/workflow-transfer.html', {
        waitUntil: 'domcontentloaded'
      })
      await page.getByRole('button', { name: '打开转交', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '转交审批待办', exact: true })
      await expect(dialog).toBeVisible()
      await assertAppearance(page, profile)
      await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
      await expect.poll(() => reads.length).toBe(1)
      await expect.poll(() => held.length).toBe(1)
      await expect(dialog.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
      const form = dialog.locator('.art-form')
      const assignee = form.locator('[data-art-form-item-key="assigneeUserId"]')
      const reasonField = form.locator('[data-art-form-item-key="reason"]')
      const reason = reasonField.locator('textarea')
      await expect(form.locator('.art-async-state[aria-busy="true"]')).toHaveCount(1)
      await expect(assignee.locator('.art-async-state')).toBeVisible()
      await expect(reason).toBeEditable()
      await reason.fill('保留当前任务的转交原因')
      await expect(form.locator('.el-form-item__error')).toHaveCount(0)
      await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
      await assignee.scrollIntoViewIfNeeded()
      const originalForm = await form.elementHandle(),
        originalAssignee = await assignee.elementHandle(),
        originalReason = await reasonField.elementHandle(),
        originalTextarea = await reason.elementHandle()
      if (!originalForm || !originalAssignee || !originalReason || !originalTextarea)
        throw new Error('审批转交字段尚未挂载')
      const settle = async () => {
        const frames = await dialog.evaluate(async (root) => {
          await document.fonts.ready
          let previous = '',
            stable = 0
          for (let attempt = 0; attempt < 120 && stable < 6; attempt++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const current = JSON.stringify(
              [
                ...root.querySelectorAll(
                  '.art-form, [data-art-form-item-key="assigneeUserId"], [data-art-form-item-key="reason"], .art-dialog__footer-actions'
                )
              ].map((element) => element.getBoundingClientRect().toJSON())
            )
            stable = current === previous ? stable + 1 : 0
            previous = current
          }
          return stable
        })
        expect(frames).toBe(6)
      }
      await settle()
      const loading = await sampleAssignee(dialog, false)
      await page.screenshot({
        path: info.outputPath('real-assignee-loading.png'),
        fullPage: true,
        animations: 'disabled'
      })
      const pending = held.shift()
      if (!pending) throw new Error('审批人控件没有待放行脚本')
      await pending.continue()
      await expect(assignee.locator('.art-async-state')).toHaveCount(0, { timeout: 60_000 })
      await expect(assignee.locator('.art-user-select')).toBeVisible()
      await expect(assignee.getByRole('combobox')).toHaveValue('')
      await expect(assignee.getByRole('combobox')).toBeEnabled()
      await expect(dialog.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
      await expect(assignee.locator('.el-select__placeholder')).toHaveText('选择同租户在职人员')
      await settle()
      const loaded = await sampleAssignee(dialog, true)
      await page.screenshot({
        path: info.outputPath('real-assignee-loaded.png'),
        fullPage: true,
        animations: 'disabled'
      })
      const path = info.outputPath('real-assignee-geometry.json')
      await writeFile(
        path,
        JSON.stringify({ profile, reads, requests, loading, loaded }, null, 2),
        'utf8'
      )
      await info.attach('real-assignee-geometry', { path, contentType: 'application/json' })
      for (const key of ['content', 'nativeContent', 'control', 'wrapper'] as const)
        for (const dimension of ['x', 'width', 'height'] as const)
          expect
            .soft(Math.abs(loading[key][dimension] - loaded[key][dimension]), `${key}.${dimension}`)
            .toBeLessThanOrEqual(2)
      for (const [label, delta] of [
        [
          '标签与控件间距',
          loading.control.y - loading.label.bottom - (loaded.control.y - loaded.label.bottom)
        ],
        [
          '后续原因标签相对表单位置',
          loading.followingLabel.y - loading.form.y - (loaded.followingLabel.y - loaded.form.y)
        ],
        ['操作区位置', loading.footer.y - loaded.footer.y],
        ['滚动内容高度', loading.scroll.height - loaded.scroll.height],
        ['滚动视口高度', loading.scroll.client - loaded.scroll.client]
      ] as const)
        expect.soft(Math.abs(delta), label).toBeLessThanOrEqual(2)
      expect(loaded.scroll.top).toBe(loading.scroll.top)
      expect(loaded.scroll.left).toBe(loading.scroll.left)
      expect(loaded.reason).toBe(loading.reason)
      expect(loaded.summary).toBe(loading.summary)
      for (const sample of [loading, loaded]) {
        expect.soft(sample.visible.control).toBe(true)
        expect.soft(sample.visible.followingLabel).toBe(true)
        expect(sample.visible.actions.map(({ text }) => text)).toEqual(['取消', '确认转交'])
        for (const action of sample.visible.actions)
          expect.soft(action.visible, action.text).toBe(true)
        expect.soft(sample.overflow.page).toBeLessThanOrEqual(1)
        expect.soft(sample.overflow.dialog).toBeLessThanOrEqual(1)
        expect.soft(sample.scroll.width - sample.scroll.clientWidth).toBeLessThanOrEqual(1)
      }
      expect(await form.evaluate((current, original) => current === original, originalForm)).toBe(
        true
      )
      expect(
        await assignee.evaluate((current, original) => current === original, originalAssignee)
      ).toBe(true)
      expect(
        await reasonField.evaluate((current, original) => current === original, originalReason)
      ).toBe(true)
      expect(
        await reason.evaluate((current, original) => current === original, originalTextarea)
      ).toBe(true)
      await expect(reason).toHaveValue('保留当前任务的转交原因')
      await expect(page.getByTestId('success-count')).toHaveText('0')
      expect(requests).toHaveLength(1)
      expect(reads).toMatchObject([
        {
          method: 'POST',
          path: '/rest/v1/rpc/list_workflow_user_options_secure',
          payload: { p_tenant_id: 'tenant-a' }
        }
      ])
      expect(writes).toEqual([])
      expect(errors).toEqual([])
      expect(warnings).toEqual([])
    } finally {
      for (const pending of held.splice(0)) await pending.continue()
    }
  })
}

for (const failed of [false, true]) {
  test(`旧转交保存${failed ? '失败' : '成功'}不影响新任务`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let saving = false
    let returned = false
    let payload: { p_task_id: string; p_reason: string; p_assignee_user_id: string } | undefined
    await page.route('**/rest/v1/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/rpc/transfer_workflow_task')) {
        payload = route.request().postDataJSON()
        saving = true
        await held
        await route.fulfill(
          failed
            ? { status: 503, json: { code: 'XX000', message: 'synthetic stale save' } }
            : { json: 'task-a' }
        )
        returned = true
        return
      }
      await route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'next-user',
            user_name: '审核员 B',
            nick_name: '审核员 B',
            user_email: 'test@example.invalid'
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
    await page.getByRole('button', { name: '打开转交' }).click()
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /审核员 B/ }).click()
    await page.getByRole('textbox', { name: /转交原因/ }).fill('原任务转交原因')
    await page.getByRole('button', { name: '确认转交', exact: true }).click()
    await expect.poll(() => saving).toBe(true)
    expect(payload).toMatchObject({
      p_task_id: 'task-a',
      p_reason: '原任务转交原因',
      p_assignee_user_id: 'next-user'
    })
    await page.getByRole('button', { name: '打开另一租户任务' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
    await page.getByRole('textbox', { name: /转交原因/ }).fill('新任务填写内容')
    release()
    await expect.poll(() => returned).toBe(true)
    await expect(page.getByTestId('success-count')).toHaveText('0')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /转交原因/ })).toHaveValue('新任务填写内容')
    await expect(page.getByRole('dialog')).toBeVisible()
  })
}

test('审批人失败可重试且保留转交原因', async ({ page }, testInfo) => {
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  let failed = true
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/transfer_workflow_task')) writes += 1
    if (
      (path.endsWith('/list_workflow_user_options_secure') || path.endsWith('/sys_user')) &&
      failed
    ) {
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic unavailable' }
      })
    }
    return route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'next-user',
          user_name: '审核员 B',
          nick_name: '审核员 B',
          user_email: 'test@example.invalid'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
  await page.getByRole('button', { name: '打开转交' }).click()
  await expect(page.getByText('审批人加载失败', { exact: true })).toBeVisible()
  const reason = page.getByRole('textbox', { name: /转交原因/ })
  await reason.fill('保留已填写的转交原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeDisabled()
  expect(writes).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('transfer-error.png'), fullPage: true })
  failed = false
  await page.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(page.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
  await expect(reason).toHaveValue('保留已填写的转交原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('transfer-recovered.png'), fullPage: true })
  const dialog = page.getByRole('dialog', { name: '转交审批待办', exact: true })
  const target = dialog.locator('.workflow-transfer__summary small')
  await expect(target).toHaveText(
    '华东物流园区仓储设备年度维护与安全升级采购申请 CGSQ-2026-1108-017'
  )
  for (const appearance of [
    { width: 390, theme: 'dark', boxBorderMode: false },
    { width: 320, theme: 'light', boxBorderMode: true },
    { width: 1440, theme: 'light', boxBorderMode: true }
  ] as const) {
    await page.setViewportSize({ width: appearance.width, height: 900 })
    await page.emulateMedia({ colorScheme: appearance.theme })
    await page.evaluate(async (appearance) => {
      const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
        new URL('/src/hooks/core/useTheme.ts', location.origin).href
      )
      const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
        new URL('/src/enums/app-enum.ts', location.origin).href
      )
      const { useSettingStore }: typeof import('../../src/store/modules/setting') = await import(
        new URL('/src/store/modules/setting.ts', location.origin).href
      )
      useTheme().switchThemeStyles(
        appearance.theme === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
      )
      useSettingStore().boxBorderMode = appearance.boxBorderMode
      document.documentElement.dataset.boxMode = appearance.boxBorderMode
        ? 'border-mode'
        : 'shadow-mode'
      await document.fonts.ready
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
    }, appearance)
    await assertAppearance(page, appearance)
    const geometry = await target.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const summary = element.closest('.workflow-transfer__summary')!
      const summaryBounds = summary.getBoundingClientRect()
      const dialog = element.closest('.art-dialog')!.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const rects = [...range.getClientRects()].filter((rect) => rect.width && rect.height)
      const style = getComputedStyle(element)
      return {
        text: range.toString(),
        lineCount: rects.length,
        textInside:
          rects.length > 0 &&
          rects.every(
            (rect) =>
              rect.left >= bounds.left - 1 &&
              rect.right <= bounds.right + 1 &&
              rect.top >= bounds.top - 1 &&
              rect.bottom <= bounds.bottom + 1
          ),
        summaryInside: summaryBounds.left >= dialog.left && summaryBounds.right <= dialog.right,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        backgroundColor: getComputedStyle(summary).backgroundColor
      }
    })
    await page.screenshot({
      path: testInfo.outputPath(`transfer-target-${appearance.width}-${appearance.theme}.png`),
      animations: 'disabled'
    })
    await testInfo.attach(`transfer-target-geometry-${appearance.width}`, {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json'
    })
    expect.soft(geometry.textInside, '转交目标标题全文在摘要内可读').toBe(true)
    expect.soft(geometry.summaryInside, '目标摘要在弹窗内').toBe(true)
    expect.soft(geometry.horizontalOverflow).toBeLessThanOrEqual(1)
    await expect(reason).toHaveValue('保留已填写的转交原因')
    await expect(dialog.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
  }
  expect(writes).toBe(0)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toBe(0)
})

test('审批转交旧租户失败不覆盖新任务', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let pending = false
  let returned = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname.endsWith('/rpc/list_workflow_user_options_secure') &&
      route.request().postDataJSON()?.p_tenant_id === 'tenant-a'
    ) {
      pending = true
      await held
      await route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic old failure' }
      })
      returned = true
      return
    }
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'next-b',
          user_name: '审核员 B',
          nick_name: '审核员 B',
          user_email: 'test@example.invalid'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
  await page.getByRole('button', { name: '打开转交' }).click()
  await expect.poll(() => pending).toBe(true)
  // 仅模拟外部任务上下文重开回调，不代表遮罩下的真实指针交互。
  await page.getByRole('button', { name: '打开另一租户任务' }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
  })
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: /转交原因/ }).fill('当前任务原因')
  release()
  await expect.poll(() => returned).toBe(true)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(page.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /转交原因/ })).toHaveValue('当前任务原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
})
