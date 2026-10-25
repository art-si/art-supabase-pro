import { expect, test, type Page } from '@playwright/test'

interface AuthFieldExpectation {
  name: string
  autocomplete: string
}

test('登录页主题切换保留已显示的账号与记住密码状态', async ({ page }) => {
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  const form = page.locator('.auth-right-wrap .form')
  await expect(form).toBeVisible({ timeout: 60_000 })
  const username = page.locator('input[name="username"]')
  const password = page.locator('input[name="password"]')
  const originalUsername = await username.inputValue()
  const originalPassword = await password.inputValue()
  const remembered = await page.getByRole('checkbox', { name: '记住密码' }).isChecked()
  const initiallyDark = await page
    .locator('html')
    .evaluate((element) => element.classList.contains('dark'))
  for (const dark of [!initiallyDark, initiallyDark]) {
    await page
      .getByRole('button', { name: dark ? '切换到深色模式' : '切换到浅色模式', exact: true })
      .click()
    await expect(form).toBeVisible()
    if (dark) await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect((await username.inputValue()) === originalUsername).toBe(true)
    expect((await password.inputValue()) === originalPassword).toBe(true)
    expect(await page.getByRole('checkbox', { name: '记住密码' }).isChecked()).toBe(remembered)
  }
})

interface AuthPageExpectation {
  path: string
  fields: AuthFieldExpectation[]
  mayBeDisabled?: boolean
}

const authPages: AuthPageExpectation[] = [
  {
    path: '/auth/login',
    fields: [
      { name: 'username', autocomplete: 'username' },
      { name: 'password', autocomplete: 'current-password' }
    ]
  },
  {
    path: '/auth/register',
    mayBeDisabled: true,
    fields: [
      { name: 'email', autocomplete: 'email' },
      { name: 'password', autocomplete: 'new-password' },
      { name: 'confirmPassword', autocomplete: 'new-password' }
    ]
  },
  {
    path: '/auth/forget-password',
    fields: [{ name: 'email', autocomplete: 'email' }]
  },
  {
    path: '/auth/reset-password',
    fields: [
      { name: 'password', autocomplete: 'new-password' },
      { name: 'confirmPassword', autocomplete: 'new-password' }
    ]
  }
]

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test('login preserves the requested default account and password', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('input[name="username"]')).toHaveValue('624944977@qq.com')
  await expect(page.locator('input[name="password"]')).toHaveValue('123456')
  await expect(page.getByRole('checkbox', { name: '记住密码' })).toBeChecked()
  await expect(page.locator('button[type="submit"]')).toContainText('登录')
})

test('login applies the platform default language before authentication', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/rest/v1/rpc/get_login_default_language', (route) =>
    route.fulfill({ json: 'en' })
  )
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('button[type="submit"]')).toContainText('Login', { timeout: 60_000 })
  await expect(page.locator('input[name="password"]')).toHaveValue('123456')
})

test('saved language preference takes priority over platform defaults', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    localStorage.setItem('sys-v1.0.0-user', JSON.stringify({ language: 'zh', isLogin: false }))
  })
  await page.route('**/rest/v1/rpc/get_login_default_language', (route) =>
    route.fulfill({ json: 'en' })
  )
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('button[type="submit"]')).toContainText('登录', { timeout: 60_000 })
})

test('login remains usable when website configuration cannot be loaded', async ({ page }) => {
  test.setTimeout(90_000)
  let configRequests = 0
  await page.route('**/rest/v1/sys_param?**', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.searchParams.get('param_key') !== 'eq.website.config') {
      await route.continue()
      return
    }

    configRequests += 1
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: '42501', message: 'permission denied' })
    })
  })

  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('button[type="submit"]')).toBeEnabled()
  expect(configRequests).toBeGreaterThan(0)
})

test('login fills saved browser credentials without removing them when remember is unchecked', async ({
  page
}) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    localStorage.setItem('art-auth-remembered-identifier', 'saved@example.com')
    localStorage.setItem('art-auth-remember-password', 'false')
    Object.defineProperty(window, 'PasswordCredential', {
      configurable: true,
      value: class PasswordCredential {}
    })
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: async () => ({
          type: 'password',
          id: 'saved@example.com',
          password: 'saved-password'
        })
      }
    })
  })

  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('input[name="username"]')).toHaveValue('saved@example.com')
  await expect(page.locator('input[name="password"]')).toHaveValue('saved-password')
  const remember = page.getByRole('checkbox', { name: '记住密码' })
  await expect(remember).not.toBeChecked()
  await page.getByText('记住密码', { exact: true }).click()
  await expect(remember).toBeChecked()
  await page.getByText('记住密码', { exact: true }).click()
  await expect(remember).not.toBeChecked()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('art-auth-remembered-identifier')))
    .toBe('saved@example.com')
})

for (const authPage of authPages) {
  test(`${authPage.path} exposes semantic form fields`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(`#${authPage.path}`, { waitUntil: 'domcontentloaded' })
    if (authPage.mayBeDisabled && /#\/403$/.test(page.url())) {
      await expect(page.getByRole('heading', { name: '当前账号无法访问' })).toBeVisible()
      return
    }
    await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

    for (const field of authPage.fields) {
      const input = page.locator(`input[name="${field.name}"]`)
      await expect(input).toHaveCount(1)
      await expect(input).toHaveAttribute('autocomplete', field.autocomplete)
      await expect(input).toHaveAttribute('aria-label', /\S+/)
    }

    await expectNoHorizontalOverflow(page)
    expect(pageErrors).toEqual([])
  })
}

test('login support links have usable hit areas', async ({ page }, testInfo) => {
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

  for (const name of ['忘记密码', '注册']) {
    const link = page.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    const bounds = await link.boundingBox()
    const minimumSize = testInfo.project.name.includes('mobile') ? 44 : 24
    expect(bounds?.width).toBeGreaterThanOrEqual(minimumSize)
    expect(bounds?.height).toBeGreaterThanOrEqual(minimumSize)
  }

  await expectNoHorizontalOverflow(page)
})

test('desktop Feishu login switches the card to an inline QR and back', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  await page.route('**/functions/v1/oauth-provider-bridge/feishu/qr-prepare', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        goto: 'https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=cli_test&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&state=test-state'
      })
    })
  })
  await page.route('**/LarkSSOSDKWebQRCode-1.0.3.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.QRLogin = ({ id }) => {
        const iframe = document.createElement('iframe');
        iframe.src = 'about:blank';
        document.getElementById(id).appendChild(iframe);
        return { matchOrigin: () => true, matchData: () => true };
      };`
    })
  })
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  const feishuButton = page.getByRole('button', { name: '使用飞书登录' })
  const channelReady = await feishuButton
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!channelReady, '飞书渠道尚未在网站配置中启用')

  await feishuButton.click()
  await expect(page.getByRole('heading', { name: '飞书扫码登录' })).toBeVisible()
  await expect(page.locator('.feishu-qr__code iframe')).toBeVisible()
  await expect(page.getByText('用飞书 App 扫一扫，并在手机上确认')).toBeVisible()
  await expect(page.getByRole('button', { name: '飞书网页授权登录' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '返回账号密码登录' }).click()
  await expect(page.locator('input[name="username"]')).toBeVisible()
})

test('OAuth callback shows progress instead of briefly exposing the login form', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-0000-0000-000000000000',
          aud: 'authenticated',
          role: 'authenticated'
        }
      })
    )
  })
  await page.route('**/functions/v1/check_user_status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    await route.abort()
  })

  await page.goto('#/auth/login?auth_action=login&channel=feishu', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '正在完成登录' })).toBeVisible()
  await expect(page.locator('input[name="username"]')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('正在')
  await expectNoHorizontalOverflow(page)
})

test('anonymous login does not download hosted business page mappings', async ({ page }) => {
  const hostedRequests: string[] = []
  page.on('request', (request) => {
    if (/bootstrap-hosted-applications(?:-|\.ts)/.test(new URL(request.url()).pathname)) {
      hostedRequests.push(request.url())
    }
  })

  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

  expect(hostedRequests).toEqual([])
})

test('short phone login keeps its header and final controls reachable', async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'))
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })

  const brand = page.locator('.auth-top-bar')
  const form = page.locator('.auth-right-wrap .form')
  await expect(form).toBeVisible()
  const brandBounds = await brand.boundingBox()
  const formBounds = await form.boundingBox()
  expect(brandBounds).not.toBeNull()
  expect(formBounds).not.toBeNull()
  expect(brandBounds!.y + brandBounds!.height).toBeLessThan(formBounds!.y)

  const trust = form.locator('.form__trust')
  await trust.scrollIntoViewIfNeeded()
  await expect(trust).toBeInViewport()
  await expectNoHorizontalOverflow(page)
})
