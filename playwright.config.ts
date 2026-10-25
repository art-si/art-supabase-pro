import { defineConfig } from '@playwright/test'

const useDevServer =
  process.env.E2E_USE_DEV_SERVER === 'true' ||
  (!process.env.CI && process.env.E2E_USE_DEV_SERVER !== 'false')
const serverPort = Number(process.env.E2E_SERVER_PORT || (useDevServer ? 41738 : 41737))
if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)
  throw new Error('E2E_SERVER_PORT 必须为 1 至 65535 的整数端口')
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${serverPort}`
const browserChannel = (process.env.E2E_BROWSER_CHANNEL ||
  (!process.env.CI ? 'chrome' : undefined)) as 'chrome' | 'msedge' | undefined
const proxyServer = process.env.E2E_PROXY_URL

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.artifacts/playwright',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      stylePath: './tests/e2e/visual-stability.css'
    }
  },
  use: {
    baseURL,
    channel: browserChannel,
    proxy: proxyServer ? { server: proxyServer, bypass: '127.0.0.1,localhost' } : undefined,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/
    },
    {
      name: 'public-desktop-1440',
      testMatch: /auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'public-mobile-390',
      testMatch: /auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: 'desktop-1440',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'playwright/.auth/user.json'
      }
    },
    {
      name: 'desktop-1280',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 720 },
        storageState: 'playwright/.auth/user.json'
      }
    },
    {
      name: 'tablet-1024',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1024, height: 768 },
        storageState: 'playwright/.auth/user.json'
      }
    },
    {
      name: 'desktop-dark-1440',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark',
        storageState: 'playwright/.auth/user.json'
      }
    },
    {
      name: 'desktop-shadow-1280',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 720 },
        storageState: 'playwright/.auth/user.json'
      }
    },
    {
      name: 'mobile-390',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts|auth-pages\.accessibility\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: 'playwright/.auth/user.json'
      }
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm serve --host 127.0.0.1 --port ${serverPort} --strictPort`,
        ...(useDevServer
          ? {
              command: `pnpm exec vite --mode e2e --host 127.0.0.1 --port ${serverPort} --strictPort`
            }
          : {}),
        url: baseURL,
        ...(!useDevServer
          ? { env: { VITE_OUT_DIR: process.env.VITE_OUT_DIR || '.artifacts/e2e-build' } }
          : {}),
        reuseExistingServer: !process.env.CI && !process.env.E2E_SERVER_PORT,
        timeout: useDevServer ? 300_000 : 120_000
      }
})
