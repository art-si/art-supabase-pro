import type { Page } from '@playwright/test'

/** Keep SDK completions controllable while exercising each real consumer's lifecycle. */
export async function mockDeferredAmapSdk(page: Page): Promise<void> {
  await page.route('**/src/hooks/core/useAmapSdk.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `let calls = 0;
      export function useAmapSdk() { return { loadAmap() {
        const request = ++calls;
        document.documentElement.dataset.sdkRequests = String(calls);
        if (!new URLSearchParams(location.search).has('holdSdk')) return Promise.resolve(window.AMap);
        return new Promise((resolve, reject) => document.addEventListener('sdk-result', (event) => {
          if (event.detail.request !== request) return;
          if (event.detail.failed) reject(new Error('synthetic old SDK failure'));
          else resolve(window.AMap);
        }));
      } } }
    `
    })
  )
}
