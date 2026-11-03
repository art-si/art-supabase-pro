import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

const fixtureUrl = '/tests/e2e/fixtures/fms-audit-scss-reuse.html'
const levels = ['high', 'medium', 'low'] as const
const phase = process.env.FMS_AUDIT_STYLE_PHASE ?? 'before'
if (phase !== 'before' && phase !== 'after')
  throw new Error('FMS_AUDIT_STYLE_PHASE 必须为 before 或 after')
const evidenceRoot = path.resolve('.artifacts/quality-audit/fms-audit-scss-reuse')
const longAction = '逐项核对票面、运单、附件和对账记录，确认原始金额与关联关系后再完成人工复核。'

type AuditMode = 'invoice' | 'cost'

function response(mode: AuditMode, level: (typeof levels)[number]) {
  const shared = {
    runId: `test-${mode}-${level}`,
    ruleVersion: 'style-fixture',
    generatedAt: '2026-11-03T08:00:00Z'
  }
  const commonAssessment = {
    riskLevel: level,
    riskScore: level === 'high' ? 75 : level === 'medium' ? 45 : 10,
    confidence: 0.9,
    recommendation: level === 'low' ? 'routine_review' : 'manual_review',
    summary: '只读审核展示，用于核对图标和步骤标记的实际样式。',
    signals: [],
    recommendedActions: [longAction, '核对完成后保留审核记录。'],
    limitations: ['测试数据仅用于视觉验收。']
  }
  return mode === 'invoice'
    ? {
        ...shared,
        assessment: {
          ...commonAssessment,
          invoiceId: `audit-invoice-${level}`,
          invoiceRecordNo: `INV-${level}`,
          invoiceNo: `INV-NO-${level}`,
          counterpartyName: '测试交易对方',
          direction: 'output',
          metrics: {
            totalAmount: 100,
            calculatedTotalAmount: 100,
            linkedAmount: 100,
            unlinkedAmount: 0,
            statementCount: 1,
            duplicateCount: 0,
            attachmentCount: 1,
            coverageRate: 1,
            taxRate: 0.06
          }
        }
      }
    : {
        ...shared,
        assessment: {
          ...commonAssessment,
          costId: `audit-cost-${level}`,
          waybillId: 'audit-waybill',
          waybillNo: `WB-${level}`,
          route: '测试始发地 → 测试目的地',
          metrics: {
            amount: 100,
            benchmarkMedian: 100,
            benchmarkSampleSize: 3,
            duplicateCount: 0,
            projectedTotalCost: 100,
            receivableAmount: 120,
            projectedGrossMargin: 0.17,
            attachmentCount: 1
          }
        }
      }
}

async function mockReadOnlyAudit(page: Page, mode: AuditMode) {
  const calls: string[] = []
  const feedbackReads: string[] = []
  const unknown: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    unknown.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  await page.route('**/rest/v1/ai_feedback?*', (route) => {
    if (route.request().method() !== 'GET') {
      unknown.push(`${route.request().method()} /rest/v1/ai_feedback`)
      return route.abort()
    }
    feedbackReads.push(route.request().url())
    return route.fulfill({ json: null })
  })
  await page.route('**/functions/v1/**', (route) => {
    unknown.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  for (const service of ['auth', 'storage']) {
    await page.route(`**/${service}/v1/**`, (route) => route.abort())
  }
  const functionName =
    mode === 'invoice' ? 'ai-invoice-compliance-auditor' : 'ai-waybill-cost-auditor'
  await page.route(`**/functions/v1/${functionName}`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    const id = body[mode === 'invoice' ? 'invoiceId' : 'costId']
    const match = /^audit-(?:invoice|cost)-(high|medium|low)$/.exec(String(id))
    if (route.request().method() !== 'POST' || !match) {
      unknown.push(`${route.request().method()} ${functionName} ${JSON.stringify(body)}`)
      return route.abort()
    }
    calls.push(String(id))
    return route.fulfill({ json: response(mode, match[1] as (typeof levels)[number]) })
  })
  return { calls, feedbackReads, unknown }
}

async function captureStyles(page: Page, mode: AuditMode) {
  const iconSelector =
    mode === 'invoice' ? '.invoice-auditor__identity-icon' : '.cost-auditor__icon'
  const stepSelector =
    mode === 'invoice' ? '.invoice-auditor__actions li > span' : '.cost-auditor__actions li > span'
  return page.evaluate(
    ({ iconSelector, stepSelector }) => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`缺少实际抽屉元素: ${selector}`)
        const css = getComputedStyle(element)
        return {
          display: css.display,
          flex: css.flex,
          placeItems: css.placeItems,
          width: css.width,
          height: css.height,
          fontSize: css.fontSize,
          fontWeight: css.fontWeight,
          color: css.color,
          backgroundColor: css.backgroundColor,
          borderRadius: css.borderRadius
        }
      }
      const icon = document.querySelector<HTMLElement>(iconSelector)!
      const svg = icon.querySelector('svg')
      const marker = document.querySelector<HTMLElement>(stepSelector)!
      const markerText = marker.firstChild
      const iconBox = icon.getBoundingClientRect()
      const svgBox = svg?.getBoundingClientRect()
      const markerBox = marker.getBoundingClientRect()
      const range = document.createRange()
      if (markerText) range.selectNodeContents(markerText)
      const textBox = range.getBoundingClientRect()
      return {
        icon: read(iconSelector),
        step: read(stepSelector),
        iconCenterDelta: svgBox
          ? Math.abs((svgBox.left + svgBox.right) / 2 - (iconBox.left + iconBox.right) / 2)
          : null,
        stepCenterDelta: Math.abs(
          (textBox.left + textBox.right) / 2 - (markerBox.left + markerBox.right) / 2
        ),
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth
      }
    },
    { iconSelector, stepSelector }
  )
}

for (const mode of ['invoice', 'cost'] as const) {
  test(`${mode} 审核抽屉图标与步骤标记样式前后等价`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const mock = await mockReadOnlyAudit(page, mode)
    const theme = info.project.name.includes('dark') ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow' : 'border'
    await page.goto(`${fixtureUrl}?mode=${mode}&theme=${theme}&box=${box}`)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    const samples: Record<string, Awaited<ReturnType<typeof captureStyles>>> = {}
    const evidenceDir = path.join(evidenceRoot, phase)
    await mkdir(evidenceDir, { recursive: true })

    for (const level of levels) {
      await page.getByRole('button', { name: `打开${level}审核` }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
      const hero = drawer.locator(
        mode === 'invoice' ? '.invoice-auditor__hero' : '.cost-auditor__hero'
      )
      await expect(hero).toHaveClass(new RegExp(`is-${level}`))
      await expect(drawer.getByText(longAction)).toBeVisible()
      const styles = await captureStyles(page, mode)
      expect(styles.icon.width).toBe('48px')
      expect(styles.icon.height).toBe('48px')
      expect(styles.icon.fontSize).toBe('24px')
      expect(styles.step.width).toBe('26px')
      expect(styles.step.height).toBe('26px')
      expect(styles.step.fontWeight).toBe('700')
      expect(styles.iconCenterDelta).not.toBeNull()
      expect(styles.iconCenterDelta!).toBeLessThanOrEqual(1)
      expect(styles.stepCenterDelta).toBeLessThanOrEqual(1)
      expect(styles.documentOverflow).toBeLessThanOrEqual(1)
      samples[level] = styles
      await page.screenshot({
        path: path.join(evidenceDir, `${info.project.name}-${mode}-${level}.png`),
        fullPage: false,
        animations: 'disabled'
      })
      await drawer
        .locator(
          mode === 'invoice'
            ? '.invoice-auditor__actions li > span'
            : '.cost-auditor__actions li > span'
        )
        .first()
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: path.join(evidenceDir, `${info.project.name}-${mode}-${level}-steps.png`),
        fullPage: false,
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await expect(drawer).toBeHidden()
    }

    expect(new Set(levels.map((level) => samples[level].icon.color)).size).toBe(3)
    expect(mock.calls).toEqual(levels.map((level) => `audit-${mode}-${level}`))
    expect(mock.feedbackReads.length).toBeGreaterThanOrEqual(levels.length)
    expect(mock.unknown).toEqual([])
    expect(errors).toEqual([])
    const snapshotPath = path.join(evidenceDir, `${info.project.name}-${mode}.json`)
    if (phase === 'after') {
      const beforePath = path.join(evidenceRoot, 'before', `${info.project.name}-${mode}.json`)
      const before = JSON.parse(await readFile(beforePath, 'utf8')) as typeof samples
      for (const level of levels) {
        expect(samples[level].icon).toEqual(before[level].icon)
        expect(samples[level].step).toEqual(before[level].step)
      }
    }
    await writeFile(snapshotPath, JSON.stringify(samples, null, 2))
  })
}
