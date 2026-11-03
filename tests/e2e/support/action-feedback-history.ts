import type { Page } from '@playwright/test'

export interface ActionFeedbackEvent {
  kind: 'success' | 'error'
  text: string
}

const outputId = 'e2e-action-feedback-history'

/** Record newly mounted Element Plus business feedback, including messages that later disappear. */
export async function installActionFeedbackHistory(page: Page): Promise<void> {
  await page.evaluate((id) => {
    if (document.getElementById(id)) return
    const output = document.createElement('output')
    output.id = id
    output.hidden = true
    output.textContent = '[]'
    document.body.append(output)

    const selector = '.el-message--success, .el-message--error'
    const seen = new WeakSet<Element>(document.querySelectorAll(selector))
    const history: Array<{ kind: 'success' | 'error'; text: string }> = []
    const record = () => {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element)) continue
        const text = element.textContent?.trim()
        if (!text) continue
        seen.add(element)
        history.push({
          kind: element.classList.contains('el-message--success') ? 'success' : 'error',
          text
        })
        output.textContent = JSON.stringify(history)
      }
    }
    new MutationObserver(record).observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
      subtree: true
    })
  }, outputId)
}

export async function readActionFeedbackHistory(page: Page): Promise<ActionFeedbackEvent[]> {
  const text = await page.locator(`#${outputId}`).textContent()
  return JSON.parse(text || '[]') as ActionFeedbackEvent[]
}
