import { expect, test, type Page, type Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const captchaSdk = `
  document.body.dataset.captchaSdkLoaded = 'true';
  const widgets = new Map();
  let sequence = 0;
  window.turnstile = {
    render(container, options) {
      const id = 'fixture-widget-' + ++sequence;
      const widget = document.createElement('div');
      widget.dataset.mockCaptcha = id;
      widget.dataset.sitekey = options.sitekey;
      widget.textContent = '验证码就绪';
      container.appendChild(widget);
      document.body.dataset.captchaRenders = String(sequence);
      widgets.set(id, { container, options, widget });
      return id;
    },
    remove(id) { widgets.get(id)?.widget.remove(); },
    reset(id) { widgets.get(id)?.widget.removeAttribute('data-executing'); },
    execute(id) {
      const widget = widgets.get(id);
      widget.widget.dataset.executing = 'true';
      if (!new URLSearchParams(location.search).has('hold'))
        queueMicrotask(() => widget.options.callback('fixture-token'));
    }
  };
  document.addEventListener('mock-captcha-verify', event => {
    widgets.get(event.detail)?.options.callback('stale-token');
  });
`
const feishuSdk = `
  window.QRLogin = ({ id }) => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    document.getElementById(id).appendChild(iframe);
    return { matchOrigin: () => true, matchData: () => true };
  };
`
const fixture = '/tests/e2e/fixtures/auth-sdk-lifecycle.html'
const captchaPattern = '**/challenges.cloudflare.com/turnstile/v0/api.js*'
const feishuPattern = '**/LarkSSOSDKWebQRCode-1.0.3.js'

async function fulfillSdk(route: Route, body: string): Promise<void> {
  await route.fulfill({ contentType: 'application/javascript', body })
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/functions/v1/oauth-provider-bridge/feishu/qr-prepare', (route) =>
    route.fulfill({
      json: {
        goto: 'https://passport.feishu.cn/suite/passport/oauth/authorize?state=fixture-state'
      }
    })
  )
})

for (const theme of ['light', 'dark']) {
  test(`验证码并发实例只加载一次 SDK，校验及重挂载正常 ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let requests = 0
    await page.route(captchaPattern, async (route) => {
      requests += 1
      await fulfillSdk(route, captchaSdk)
    })
    await page.goto(`${fixture}?count=2&theme=${theme}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-mock-captcha]')).toHaveCount(2)
    expect(requests).toBe(1)
    await page.getByRole('button', { name: '执行验证码', exact: true }).click()
    await expect(page.getByTestId('captcha-outcome')).toHaveText('fixture-token')
    await expect(page.getByTestId('captcha-verified')).toHaveText('1')
    await expectNoOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`captcha-${theme}.png`), fullPage: true })
    await page.getByRole('button', { name: '切换挂载', exact: true }).click()
    await expect(page.locator('[data-mock-captcha]')).toHaveCount(0)
    await page.getByRole('button', { name: '切换挂载', exact: true }).click()
    await expect(page.locator('[data-mock-captcha]')).toHaveCount(2)
    expect(requests).toBe(1)
    expect(errors).toEqual([])
  })
}

test('验证码脚本失败后可以重试且不会产生未处理异常', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let requests = 0
  await page.route(captchaPattern, async (route) => {
    requests += 1
    if (requests === 1) await route.fulfill({ status: 503, body: 'unavailable' })
    else await fulfillSdk(route, captchaSdk)
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('captcha-errors')).toHaveText('1')
  await expect(page.getByText('验证码加载失败', { exact: true })).toBeVisible()
  await expectNoOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('captcha-sdk-error.png'), fullPage: true })
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('[data-mock-captcha]')).toHaveCount(1)
  await page.getByRole('button', { name: '执行验证码', exact: true }).click()
  await expect(page.getByTestId('captcha-outcome')).toHaveText('fixture-token')
  expect(requests).toBe(2)
  expect(errors).toEqual([])
})

test('加载期间配置变更和卸载不会渲染过期验证码', async ({ page }, testInfo) => {
  let pending: Route | undefined
  await page.route(captchaPattern, (route) => {
    pending = route
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => Boolean(pending)).toBe(true)
  await expect(page.locator('.art-turnstile-captcha .art-async-state')).toHaveAttribute(
    'aria-busy',
    'true'
  )
  await expectNoOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('captcha-sdk-loading.png'), fullPage: true })
  await page.getByRole('button', { name: '更新验证码配置', exact: true }).click()
  await page.getByRole('button', { name: '切换挂载', exact: true }).click()
  await fulfillSdk(pending!, captchaSdk)
  await expect(page.locator('body')).toHaveAttribute('data-captcha-sdk-loaded', 'true')
  expect(await page.locator('body').getAttribute('data-captcha-renders')).toBeNull()
  await page.getByRole('button', { name: '切换挂载', exact: true }).click()
  await expect(page.locator('[data-mock-captcha]')).toHaveAttribute(
    'data-sitekey',
    'fixture-key-changed'
  )
  await expect(page.locator('body')).toHaveAttribute('data-captcha-renders', '1')
})

for (const action of ['重置验证码', '移除验证码', '切换挂载']) {
  test(`等待中的验证码执行在${action}后结束`, async ({ page }) => {
    await page.route(captchaPattern, (route) => fulfillSdk(route, captchaSdk))
    await page.goto(`${fixture}?hold=1`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-mock-captcha]')).toHaveCount(1)
    await page.getByRole('button', { name: '执行验证码', exact: true }).click()
    await expect(page.locator('[data-executing]')).toHaveCount(1)
    const id = await page.locator('[data-executing]').getAttribute('data-mock-captcha')
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByTestId('captcha-outcome')).toHaveText('验证码校验已取消，请重试')
    if (action !== '重置验证码') {
      await page.evaluate(
        (id) => document.dispatchEvent(new CustomEvent('mock-captcha-verify', { detail: id })),
        id
      )
      await expect(page.getByTestId('captcha-verified')).toHaveText('0')
    }
  })
}

test('加载期间更新配置只渲染最新验证码', async ({ page }) => {
  let pending: Route | undefined
  await page.route(captchaPattern, (route) => {
    pending = route
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => Boolean(pending)).toBe(true)
  await page.getByRole('button', { name: '更新验证码配置', exact: true }).click()
  await fulfillSdk(pending!, captchaSdk)
  await expect(page.locator('[data-mock-captcha]')).toHaveCount(1)
  await expect(page.locator('[data-mock-captcha]')).toHaveAttribute(
    'data-sitekey',
    'fixture-key-changed'
  )
  await expect(page.locator('body')).toHaveAttribute('data-captcha-renders', '1')
})

test('飞书复用共享 loading 并在卸载后不创建旧二维码', async ({ page }, testInfo) => {
  let pending: Route | undefined
  await page.route(feishuPattern, (route) => {
    pending = route
  })
  await page.goto(`${fixture}?kind=feishu&theme=dark`, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => Boolean(pending)).toBe(true)
  await expect(page.locator('.feishu-qr .art-async-state')).toHaveAttribute('aria-busy', 'true')
  const motion = await page.locator('.art-overlay-loading__spinner').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      durationSeconds: Number.parseFloat(style.animationDuration),
      iterations: style.animationIterationCount
    }
  })
  expect(motion.durationSeconds).toBeLessThanOrEqual(0.00001)
  expect(motion.iterations).toBe('1')
  for (const button of await page.locator('.feishu-qr__actions button').all()) {
    const bounds = await button.boundingBox()
    expect(bounds?.height).toBeGreaterThanOrEqual(
      testInfo.project.name.includes('mobile') ? 44 : 24
    )
  }
  await expectNoOverflow(page)
  await page.screenshot({
    path: testInfo.outputPath('feishu-sdk-loading-dark.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '切换挂载', exact: true }).click()
  await fulfillSdk(pending!, feishuSdk)
  await expect(page.getByTestId('mount-status')).toHaveText('已卸载')
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: '切换挂载', exact: true }).click()
  await expect(page.locator('.feishu-qr__code iframe')).toBeVisible()
})

test('飞书 SDK 失败可刷新恢复，重挂载复用脚本且拒绝错误消息来源', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let requests = 0
  await page.route(feishuPattern, async (route) => {
    requests += 1
    if (requests === 1) await route.fulfill({ status: 503, body: 'unavailable' })
    else await fulfillSdk(route, feishuSdk)
  })
  await page.goto(`${fixture}?kind=feishu`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.feishu-qr .el-result')).toBeVisible()
  await expectNoOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('feishu-sdk-error.png'), fullPage: true })
  await page.getByRole('button', { name: '刷新二维码', exact: true }).click()
  await expect(page.locator('.feishu-qr__code iframe')).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://passport.feishu.cn',
        source: window,
        data: { tmp_code: 'forged-code' }
      })
    )
  )
  await expect(page.locator('.feishu-qr__status')).not.toContainText('正在完成登录')
  await expectNoOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('feishu-sdk-ready.png'), fullPage: true })
  await page.getByRole('button', { name: '返回账号密码登录', exact: true }).click()
  await page.getByRole('button', { name: '切换挂载', exact: true }).click()
  await expect(page.locator('.feishu-qr__code iframe')).toBeVisible()
  expect(requests).toBe(2)
  expect(errors).toEqual([])
})
