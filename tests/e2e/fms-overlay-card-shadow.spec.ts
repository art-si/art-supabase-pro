import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { compareShadowPaint, shadowPaintRegion, type PaintRect } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const entry =
  'modules/art-supabase-fms/src/views/treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue'
const row = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId,
  accountSetId: '55555555-5555-4555-8555-555555555555',
  transferNo: 'SHADOW-TRANSFER-001',
  transferDate: '2026-11-01',
  amount: 100,
  feeAmount: 0,
  purpose: '卡片投影验收',
  status: 'draft',
  version: 1,
  createBy: '验收创建人',
  createTime: '2026-11-01T08:00:00Z',
  updateTime: '2026-11-01T08:00:00Z',
  sourceAccountName: '验收来源账户',
  targetAccountName: '验收目标账户',
  currencyCode: 'CNY',
  currencyName: '人民币',
  fieldAccess: { transferAccounts: 'read', transferAmounts: 'read', bankReference: 'hidden' }
}

async function settle(card: Locator): Promise<void> {
  const frames = await card.evaluate(async (element) => {
    await document.fonts.ready
    let previous = ''
    let stable = 0
    for (let attempt = 0; attempt < 120 && stable < 6; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bounds = element.getBoundingClientRect()
      const wrap = element
        .closest('.art-drawer__scrollbar, .art-dialog__scrollbar')
        ?.querySelector('.el-scrollbar__wrap')
      const current = JSON.stringify([
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        wrap?.scrollTop,
        wrap?.scrollHeight
      ])
      stable = current === previous ? stable + 1 : 0
      previous = current
    }
    return stable
  })
  expect(frames).toBe(6)
}

async function inspect(card: Locator) {
  return card.evaluate((element) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      }
    }
    const geometry = (node: Element) => [
      ...Object.values(box(node)),
      node.clientWidth,
      node.clientHeight,
      node.scrollWidth,
      node.scrollHeight,
      node.scrollLeft,
      node.scrollTop
    ]
    const overlay = element.closest('.art-drawer, .art-dialog')!
    const wrap = overlay.querySelector(
      ':is(.art-drawer__scrollbar, .art-dialog__scrollbar) > .el-scrollbar__wrap'
    )!
    const content = overlay.querySelector('.art-overlay-tab-card > .el-tabs__content')!
    const ancestors = []
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      ancestors.push({
        className: node.className,
        geometry: geometry(node),
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clipPath: style.clipPath,
        clipMargin: style.overflowClipMargin
      })
    }
    return {
      rect: box(element),
      targetGeometry: geometry(element),
      shadow: getComputedStyle(element).boxShadow,
      ancestors,
      wrap: box(wrap),
      content: box(content),
      wrapClipPath: getComputedStyle(wrap).clipPath,
      inset: parseFloat(getComputedStyle(wrap).scrollPaddingBottom),
      clipMargin: parseFloat(getComputedStyle(content).overflowClipMargin) || 0,
      scrollRange: wrap.scrollHeight - wrap.clientHeight,
      scrollTop: wrap.scrollTop,
      page: [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
        scrollX,
        scrollY
      ],
      viewport: { width: innerWidth, height: innerHeight }
    }
  })
}

type ShadowState = Awaited<ReturnType<typeof inspect>>
const layout = (state: ShadowState) => ({
  target: state.targetGeometry,
  ancestors: state.ancestors.map(({ geometry }) => geometry),
  page: state.page
})

/** Keep scrolling and every box intact while isolating one card's painted shadow. */
async function expectOverlayShadow(
  page: Page,
  overlay: Locator,
  card: Locator,
  info: TestInfo,
  path: 'manual-panel' | 'wrap-clip',
  label: string
): Promise<void> {
  const wrap = overlay.locator(
    ':is(.art-drawer__scrollbar, .art-dialog__scrollbar) > .el-scrollbar__wrap'
  )
  const content = overlay.locator('.art-overlay-tab-card > .el-tabs__content')
  const surfaces = await overlay.locator('.art-card, .art-card-sm, .art-card-xs').all()
  const styled = [wrap, content, ...surfaces]
  const originals = await Promise.all(styled.map((node) => node.getAttribute('style')))
  await settle(card)
  const original = await inspect(card)
  expect(original.shadow).not.toBe('none')
  await page.screenshot({ path: info.outputPath(`${label}-context.png`), animations: 'disabled' })
  try {
    await card.evaluate((element) => {
      // Other card shadows cannot contribute paint revealed by the reference ancestor.
      for (const node of element
        .closest('.art-drawer, .art-dialog')!
        .querySelectorAll<HTMLElement>('.art-card, .art-card-sm, .art-card-xs'))
        if (node !== element) node.style.setProperty('box-shadow', 'none', 'important')
    })
    if (path === 'manual-panel')
      await wrap.evaluate((node) => node.style.setProperty('clip-path', 'none', 'important'))
    await settle(card)
    const before = await inspect(card)
    expect(layout(before)).toEqual(layout(original))
    const samples: PaintRect[] = []
    if (path === 'wrap-clip') {
      const top = Math.ceil(before.rect.bottom + 1)
      samples.push({
        x: Math.ceil(before.rect.x + 24),
        y: top,
        width: Math.floor(before.rect.right - 24) - Math.ceil(before.rect.x + 24),
        height:
          Math.floor(
            Math.min(before.rect.bottom + 24, before.wrap.bottom - 2, before.viewport.height - 2)
          ) - top
      })
    } else {
      // Fixed outside-card bands retain real shadow ink after the panel clip is corrected.
      const top = Math.ceil(Math.max(before.rect.y + 28, before.wrap.y + 4))
      const bottom = Math.floor(
        Math.min(before.rect.bottom - 24, before.wrap.bottom - 4, before.viewport.height - 4)
      )
      const left = Math.ceil(Math.max(2, before.wrap.x + 2, before.rect.x - 24))
      const right = Math.floor(
        Math.min(before.viewport.width - 2, before.wrap.right - 2, before.rect.right + 24)
      )
      const leftEnd = Math.floor(before.rect.x - 1)
      const rightStart = Math.ceil(before.rect.right + 1)
      samples.push(
        { x: left, y: top, width: leftEnd - left, height: bottom - top },
        { x: rightStart, y: top, width: right - rightStart, height: bottom - top }
      )
    }
    await writeFile(
      info.outputPath(`${label}-setup.json`),
      JSON.stringify({ original, before, samples }, null, 2)
    )
    const region = shadowPaintRegion(samples)
    const capture = () => page.screenshot({ clip: region, scale: 'css', animations: 'disabled' })
    const actual = await capture()
    const repeat = await capture()
    if (path === 'wrap-clip')
      await wrap.evaluate((node) => node.style.setProperty('clip-path', 'none', 'important'))
    else
      await content.evaluate((node) =>
        node.style.setProperty('overflow-clip-margin', '40px', 'important')
      )
    await settle(card)
    const referenceGeometry = await inspect(card)
    expect(layout(referenceGeometry)).toEqual(layout(original))
    const reference = await capture()
    await card.evaluate((node) => node.style.setProperty('box-shadow', 'none', 'important'))
    await settle(card)
    const backgroundGeometry = await inspect(card)
    expect(layout(backgroundGeometry)).toEqual(layout(original))
    const background = await capture()
    const stability = compareShadowPaint(actual, repeat, region, samples)
    const paint = compareShadowPaint(actual, reference, region, samples)
    const shadow = compareShadowPaint(reference, background, region, samples)
    const proof = info.outputPath(`${label}-proof.json`)
    await writeFile(
      proof,
      JSON.stringify(
        {
          original,
          before,
          referenceGeometry,
          backgroundGeometry,
          samples,
          region,
          stability,
          paint,
          shadow
        },
        null,
        2
      )
    )
    await info.attach(`${label}-proof`, { path: proof, contentType: 'application/json' })
    for (const [stage, body] of [
      ['actual', actual],
      ['reference', reference],
      ['target-shadow-off', background]
    ] as const) {
      const output = info.outputPath(`${label}-${stage}.png`)
      await writeFile(output, body)
      await info.attach(`${label}-${stage}`, { path: output, contentType: 'image/png' })
    }
    expect(stability.maxChannelDelta, `${label}: stable paint`).toBeLessThanOrEqual(1)
    expect(
      shadow.changedPixels,
      `${label}: reference must contain the target shadow`
    ).toBeGreaterThan(0)
    expect
      .soft(paint.maxChannelDelta, `${label}: shadow must match its paint-only reference`)
      .toBeLessThanOrEqual(1)
  } finally {
    await Promise.all(
      styled.map((node, index) =>
        node.evaluate((element, originalStyle) => {
          if (originalStyle === null) element.removeAttribute('style')
          else element.setAttribute('style', originalStyle)
        }, originals[index])
      )
    )
    await settle(card)
    expect(await Promise.all(styled.map((node) => node.getAttribute('style')))).toEqual(originals)
    expect(layout(await inspect(card))).toEqual(layout(original))
  }
}

async function openFmsOverlay(
  page: Page,
  options: {
    entry: string
    width: number
    theme: 'dark' | 'light'
    input: NonNullable<Window['formsMigrationInput']>
    responses: Record<string, unknown>
  }
) {
  const errors: string[] = [],
    warnings: string[] = [],
    writes: string[] = [],
    reads: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/\[Vue warn\]|Maximum recursive updates|invoked outside of the render/.test(message.text()))
      warnings.push(message.text())
  })
  await page.setViewportSize({ width: options.width, height: 844 })
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  await prepareAppearance(page, { theme: options.theme, boxBorderMode: false })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request(),
      url = new URL(request.url())
    const rpc = url.pathname.split('/rpc/')[1]
    const key = rpc || url.pathname.split('/').at(-1) || ''
    if (Object.hasOwn(options.responses, key)) {
      reads.push(key)
      return route.fulfill({ json: options.responses[key] })
    }
    if (rpc === 'current_is_super') return route.fulfill({ json: false })
    if (rpc && ['get_organization_list_secure', 'get_table_column_runtime'].includes(rpc))
      return route.fulfill({ json: [] })
    if (request.method() !== 'GET') {
      writes.push(request.url())
      return route.fulfill({ status: 403, json: { message: '投影验收禁止业务写入' } })
    }
    return route.fulfill({ json: [] })
  })
  await page.addInitScript((input) => {
    window.formsMigrationInput = input
  }, options.input)
  await page.goto(
    `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(options.entry)}&theme=${options.theme}`
  )
  await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
  await assertAppearance(page, { theme: options.theme, boxBorderMode: false })
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
  await expect(page.getByTestId('open-error')).toBeEmpty()
  const overlay = page.locator('.art-drawer:visible, .art-dialog:visible').first()
  await expect(overlay).toBeVisible({ timeout: 60_000 })
  await expect(overlay.locator('.art-drawer__viewport, .art-dialog__viewport')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  const scrollbar = overlay.locator('.art-drawer__scrollbar, .art-dialog__scrollbar')
  const wrap = scrollbar.locator(':scope > .el-scrollbar__wrap')
  const expectClean = async () => {
    expect(
      await overlay.evaluate((node) => node.scrollWidth - node.clientWidth)
    ).toBeLessThanOrEqual(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(writes).toEqual([])
    await expect(page.getByTestId('successes')).toHaveText('0')
  }
  return { overlay, scrollbar, wrap, reads, expectClean }
}

for (const variant of [
  { width: 390, theme: 'dark', longHistory: true },
  { width: 390, theme: 'dark', longHistory: false },
  { width: 1440, theme: 'light', longHistory: false }
] as const) {
  const { width, theme, longHistory } = variant
  test(`真实资金调拨无底栏卡片投影 ${width} ${theme} shadow ${longHistory ? '长轨迹末端' : '短内容对照'}`, async ({
    page
  }, info) => {
    const actions = Array.from({ length: longHistory ? 12 : 1 }, (_, index) => ({
      id: `shadow-action-${index + 1}`,
      tenantId,
      transferId: row.id,
      action: 'create',
      toStatus: 'draft',
      actionBy: `验收操作人${index + 1}`,
      actionTime: '2026-11-01T08:00:00Z',
      actionRemark: `验收操作轨迹 ${index + 1}`
    }))
    const {
      overlay: drawer,
      scrollbar,
      wrap,
      reads,
      expectClean
    } = await openFmsOverlay(page, {
      entry,
      width,
      theme,
      responses: {
        fms_get_fund_transfer_secure: row,
        fms_list_fund_transfer_actions_secure: actions
      },
      input: {
        args: [row],
        permissions: ['FinanceFundTransfer:View'],
        dicts: {
          fmsFundTransferStatus: [
            {
              id: 'draft',
              code: 'fmsFundTransferStatus',
              value: 'draft',
              label: '草稿',
              sort: 1,
              status: '1'
            }
          ]
        }
      }
    })
    await expect(drawer.locator('.art-drawer__footer')).toHaveCount(0)
    await expect(scrollbar).toHaveClass(/art-scroll-viewport-inset/)
    await drawer.getByRole('tab', { name: '调拨资料', exact: true }).click()
    const detailCard = drawer
      .getByRole('tabpanel', { name: '调拨资料', exact: true })
      .locator('.art-section-card')
      .first()
    await expect(detailCard.getByText('调拨信息', { exact: true })).toBeVisible()
    await wrap.evaluate((node) => {
      node.scrollTop = 0
    })
    await expectOverlayShadow(page, drawer, detailCard, info, 'manual-panel', 'details-panel')
    const outerCard = drawer.locator('.fund-transfer-detail > .art-overlay-tab-card')
    if (width === 1440) {
      await settle(outerCard)
      const shortDetails = await inspect(outerCard)
      expect(shortDetails.scrollRange).toBeLessThanOrEqual(1)
      await expectOverlayShadow(page, drawer, outerCard, info, 'wrap-clip', 'details-wrap')
      await expectClean()
      expect(reads.sort()).toEqual([
        'fms_get_fund_transfer_secure',
        'fms_list_fund_transfer_actions_secure'
      ])
      return
    }
    await drawer.getByRole('tab', { name: '操作轨迹', exact: true }).click()
    const panel = drawer.getByRole('tabpanel', { name: '操作轨迹', exact: true })
    await expect(panel.locator('ol > li')).toHaveCount(actions.length)
    await wrap.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await settle(outerCard)
    const end = await inspect(outerCard)
    if (longHistory) {
      expect(end.scrollRange).toBeGreaterThan(100)
      expect(Math.abs(end.scrollTop - end.scrollRange)).toBeLessThanOrEqual(1)
    } else {
      expect(end.scrollRange).toBeLessThanOrEqual(1)
      expect(end.scrollTop).toBe(0)
      expect(end.wrap.bottom - end.rect.bottom - end.inset).toBeGreaterThan(24)
    }
    await expectOverlayShadow(page, drawer, outerCard, info, 'wrap-clip', 'actions-wrap')
    if (longHistory) {
      await drawer.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(drawer.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible()
      await wrap.evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await settle(outerCard)
      const fullscreenEnd = await inspect(outerCard)
      expect(fullscreenEnd.scrollRange).toBeGreaterThan(100)
      expect(Math.abs(fullscreenEnd.scrollTop - fullscreenEnd.scrollRange)).toBeLessThanOrEqual(1)
      await expectOverlayShadow(
        page,
        drawer,
        outerCard,
        info,
        'wrap-clip',
        'actions-fullscreen-wrap'
      )
    }
    expect(reads.sort()).toEqual([
      'fms_get_fund_transfer_secure',
      'fms_list_fund_transfer_actions_secure'
    ])
    await expectClean()
  })
}

test('真实会计凭证无底栏卡片投影 390 dark shadow 长流水末端', async ({ page }, info) => {
  const voucher = {
    ...row,
    voucherNo: 'SHADOW-VOUCHER-001',
    voucherDate: '2026-11-01',
    voucherType: 'general',
    fiscalYear: 2026,
    periodNo: 11,
    sourceType: 'manual',
    summary: '凭证投影验收',
    accountSet: { accountSetName: '验收账套' },
    lineCount: 0,
    lines: [],
    attachments: [],
    fieldAccess: {
      voucherAmounts: 'read',
      voucherAttachments: 'hidden',
      auditTrail: 'read',
      sourceReferences: 'hidden'
    },
    actions: Array.from({ length: 16 }, (_, index) => ({
      id: `voucher-shadow-action-${index + 1}`,
      action: 'create',
      actor: `验收制单人${index + 1}`,
      actionTime: '2026-11-01T08:00:00Z',
      reason: `凭证操作轨迹验收 ${index + 1}`
    }))
  }
  const {
    overlay: drawer,
    scrollbar,
    wrap,
    reads,
    expectClean
  } = await openFmsOverlay(page, {
    entry:
      'modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-detail-drawer.vue',
    width: 390,
    theme: 'dark',
    responses: { fms_get_voucher_secure: voucher },
    input: {
      args: [voucher],
      permissions: ['FinanceVoucherCenter:View'],
      dicts: {
        fmsPostingWaybillCostType: [],
        fmsBillEventType: [],
        fmsTaxType: [],
        fmsVoucherStatus: [],
        fmsVoucherType: []
      }
    }
  })
  await expect(drawer.locator('.art-drawer__footer')).toHaveCount(0)
  await expect(scrollbar).toHaveClass(/art-scroll-viewport-inset/)
  await drawer.getByRole('tab', { name: '操作流水', exact: true }).click()
  await expect(
    drawer.getByRole('tabpanel', { name: '操作流水', exact: true }).locator('.el-timeline-item')
  ).toHaveCount(voucher.actions.length)
  const card = drawer.locator('.voucher-detail > .art-overlay-tab-card')
  await wrap.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await settle(card)
  const end = await inspect(card)
  expect(end.scrollRange).toBeGreaterThan(100)
  expect(Math.abs(end.scrollTop - end.scrollRange)).toBeLessThanOrEqual(1)
  await expectOverlayShadow(page, drawer, card, info, 'wrap-clip', 'voucher-history-wrap')
  const lastCard = drawer.locator('.art-section-card:visible').last()
  await expect(lastCard.getByText('关联信息', { exact: true })).toBeVisible()
  await expectOverlayShadow(page, drawer, lastCard, info, 'wrap-clip', 'voucher-related-wrap')
  expect(reads).toEqual(['fms_get_voucher_secure'])
  await expectClean()
})

for (const readonly of [true, false]) {
  test(`真实还款弹窗卡片投影 ${readonly ? '390 dark 只读长文本末端' : '1440 light 带操作栏对照'}`, async ({
    page
  }, info) => {
    const loan = {
      id: '66666666-6666-4666-8666-666666666666',
      tenantId,
      loanNo: 'SHADOW-LOAN-001',
      applicantName: '验收还款人',
      applicantCompanyName: '验收公司',
      expenseDepartmentName: '验收部门',
      expenseCompanyName: '验收公司',
      loanAmount: 100,
      paidAmount: 100,
      remainingBalance: 100,
      availableAmount: 100,
      reason: '还款投影验收',
      isDemo: false,
      items: []
    }
    const repayment = {
      id: row.id,
      tenantId,
      loanId: loan.id,
      repaymentNo: 'SHADOW-REPAY-001',
      repaymentDate: '2026-11-01',
      reason: readonly ? '归还项目备用金并核对原始单据。'.repeat(30) : '归还项目备用金',
      payerName: '验收还款人',
      payerBank: '验收银行',
      bankAccount: '622200000001',
      remark: readonly ? '还款资料已核对，附件与借款事项保持一致。'.repeat(25) : '还款资料已核对',
      amount: 100,
      status: 'draft',
      attachmentUrls: [],
      items: [],
      receipts: []
    }
    const {
      overlay: dialog,
      scrollbar,
      wrap,
      reads,
      expectClean
    } = await openFmsOverlay(page, {
      entry:
        'modules/art-supabase-fms/src/views/everyone-expense/repayment/modules/repayment-dialog.vue',
      width: readonly ? 390 : 1440,
      theme: readonly ? 'dark' : 'light',
      responses: {
        fms_travel_repayment: repayment,
        fms_travel_loan: loan,
        fms_list_repayable_loans_secure: [loan]
      },
      input: {
        args: [{ row: repayment, readonly }],
        permissions: ['FinanceRepayment:View', 'FinanceRepayment:Edit']
      }
    })
    await dialog.getByRole('tab', { name: '还款资料', exact: true }).click()
    const card = dialog.locator('.art-dialog__content > div > .art-overlay-tab-card')
    await expect(card).toBeVisible()
    if (readonly) {
      await expect(dialog.locator('.art-dialog__footer')).toHaveCount(0)
      await expect(scrollbar).toHaveClass(/art-scroll-viewport-inset/)
      await expect(card.getByText(repayment.reason, { exact: true })).toBeVisible()
      await expect(card.getByText(repayment.remark, { exact: true })).toBeVisible()
    } else {
      await expect(dialog.locator('.art-dialog__footer')).toBeVisible()
      await expect(dialog.getByRole('button', { name: '保存草稿', exact: true })).toBeVisible()
      await expect(scrollbar).not.toHaveClass(/art-scroll-viewport-inset/)
      await expect(dialog.getByRole('textbox', { name: /还款事由$/ })).toHaveValue(repayment.reason)
    }
    await wrap.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await settle(card)
    const end = await inspect(card)
    if (readonly) expect(end.scrollRange).toBeGreaterThan(100)
    expect(Math.abs(end.scrollTop - end.scrollRange)).toBeLessThanOrEqual(1)
    await expectOverlayShadow(
      page,
      dialog,
      card,
      info,
      'wrap-clip',
      readonly ? 'repayment-readonly-wrap' : 'repayment-footer-wrap'
    )
    if (readonly) {
      await dialog.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(dialog.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible()
      await wrap.evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await settle(card)
      const fullscreenEnd = await inspect(card)
      expect(fullscreenEnd.scrollRange).toBeGreaterThan(100)
      expect(Math.abs(fullscreenEnd.scrollTop - fullscreenEnd.scrollRange)).toBeLessThanOrEqual(1)
      await expectOverlayShadow(page, dialog, card, info, 'wrap-clip', 'repayment-fullscreen-wrap')
    }
    expect(reads.sort()).toEqual([
      'fms_list_repayable_loans_secure',
      'fms_travel_loan',
      'fms_travel_repayment'
    ])
    await expectClean()
  })
}
