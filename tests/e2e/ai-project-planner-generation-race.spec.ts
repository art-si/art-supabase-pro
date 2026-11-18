import { expect, test, type Page } from '@playwright/test'
import type { AiPlannerCapabilities, AiPlannerState } from '../../src/types/ai-project-planner'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixtureUrl = '/tests/e2e/fixtures/ai-project-planner-generation-race.html'
const oldTitle = '既有项目建议'
const newTitle = '并发生成的新批次建议'
const snapshot = {
  schemaVersion: '1',
  generatedAt: '2026-11-16T00:00:00Z',
  sourceHash: 'fixture',
  sourceVersion: 'fixture'
}

function plannerState(generated: boolean): AiPlannerState {
  const id = generated ? 'new-batch' : 'old-batch'
  const time = generated ? '2026-11-16T01:00:00Z' : snapshot.generatedAt
  const preferenceSummary: AiPlannerState['preferenceSummary'] = {
    totalSignals: 0,
    categoryScores: {
      product: 0,
      business: 0,
      ui_ux: 0,
      security: 0,
      performance: 0,
      quality: 0,
      developer_experience: 0
    },
    preferredCategories: [],
    avoidedCategories: []
  }
  return {
    latestBatch: {
      id,
      snapshotId: 'fixture',
      focus: 'balanced',
      effort: 'mixed',
      status: 'succeeded',
      model: 'test',
      promptVersion: '1',
      preferenceSummary,
      suggestionCount: 1,
      errorMessage: null,
      finishedAt: time,
      createTime: time
    },
    suggestions: [
      {
        id,
        batchId: id,
        category: 'quality',
        title: generated ? newTitle : oldTitle,
        summary: '隔离测试建议',
        evidence: [],
        whyNow: '隔离测试',
        impact: 3,
        effort: 'medium',
        confidence: 0.8,
        risk: '隔离测试',
        prompt: '隔离测试提示词',
        acceptanceCriteria: [],
        status: 'active',
        rankScore: 80,
        position: 1,
        feedback: { sentiment: 0, copied: 0, expanded: 0 },
        acceptedAt: null,
        completedAt: null,
        dismissedAt: null,
        createTime: time,
        updateTime: time
      }
    ],
    preferenceSummary,
    statusCounts: { active: 1, accepted: 0, completed: 0, dismissed: 0, expired: 0 },
    snapshot
  }
}

async function mockPlanner(page: Page, platformSuper: boolean) {
  await prepareIsolatedSession(page, { platformSuper })
  const generationStarted = Promise.withResolvers<void>()
  const releaseGeneration = Promise.withResolvers<void>()
  const capabilities: AiPlannerCapabilities = {
    version: '1',
    providerConfigured: true,
    provider: 'test',
    model: 'test',
    providers: [],
    protocol: 'openai_compatible',
    structuredOutput: true,
    access: {
      mode: platformSuper ? 'platform_write' : 'tenant_read_only',
      canManageWorkflow: platformSuper
    },
    repositorySnapshot: snapshot,
    categories: ['quality'],
    efforts: ['mixed'],
    events: []
  }
  let generated = false
  await page.route('**/functions/v1/ai-project-planner', async (route) => {
    const { action } = route.request().postDataJSON()
    if (action === 'capabilities') return route.fulfill({ json: capabilities })
    if (action === 'list') return route.fulfill({ json: plannerState(generated) })
    if (action === 'generate') {
      generationStarted.resolve()
      await releaseGeneration.promise
      generated = true
      return route.fulfill({ json: plannerState(true) })
    }
    return route.fulfill({ status: 400, json: { message: 'Unexpected planner fixture action' } })
  })
  return { generationStarted, releaseGeneration }
}

test('生成期间刷新旧建议，生成完成后仍展示并选中新批次', async ({ page }) => {
  const { generationStarted, releaseGeneration } = await mockPlanner(page, true)
  await page.goto(fixtureUrl)
  const list = page.locator('.ai-planner__list')
  const generate = page.getByRole('button', { name: '生成下一步', exact: true })
  await expect(list.getByText(oldTitle, { exact: true })).toBeVisible()
  const keyword = page.getByPlaceholder('搜索标题、说明、证据或风险')
  await keyword.fill(oldTitle)

  try {
    await generate.click()
    await generationStarted.promise
    await page.getByRole('button', { name: '刷新建议' }).click()
    await expect(page.getByText('建议已刷新', { exact: true })).toBeVisible()
    await expect(list.getByText(oldTitle, { exact: true })).toBeVisible()
    releaseGeneration.resolve()

    await expect(generate).toBeEnabled()
    await expect(list.getByText(newTitle, { exact: true })).toBeVisible()
    await expect(keyword).toHaveValue('')
  } finally {
    releaseGeneration.resolve()
  }
})

test('普通账号仍可以读取和刷新建议', async ({ page }) => {
  await mockPlanner(page, false)
  await page.goto(`${fixtureUrl}?access=tenant`)
  const list = page.locator('.ai-planner__list')
  await expect(list.getByText(oldTitle, { exact: true })).toBeVisible()
  await expect(list.getByText('推进决策', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '刷新建议' }).click()
  await expect(page.getByText('建议已刷新', { exact: true })).toBeVisible()
})
