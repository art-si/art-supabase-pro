import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['geocode', 'driving'] as const) {
  for (const scenario of ['success', 'empty', 'invalid', 'timeout', 'throw'] as const) {
    test(`${mode === 'geocode' ? '地址解析' : '路线估算'}完成、失败和超时均恢复操作 ${scenario}`, async ({
      page
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.clock.install()
      await page.route('**/src/hooks/core/useAmapSdk.ts*', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export function useAmapSdk() {
          return { loadAmap: async () => ({ Driving: class {
            search(origin, destination, callback) {
              const scenario = ${JSON.stringify(scenario)};
              if (scenario === 'timeout') return;
              if (scenario === 'throw') throw new Error('地址服务暂不可用，请稍后重试');
              callback(scenario === 'empty' ? 'no_data' : 'complete', {
                routes: [{ distance: scenario === 'invalid' ? 'bad' : 12345, time: 651 }]
              });
            }
          }, Geocoder: class {
            getLocation(address, callback) {
              const scenario = ${JSON.stringify(scenario)};
              if (scenario === 'timeout') return;
              if (scenario === 'throw') throw new Error('地址服务暂不可用，请稍后重试');
              callback(scenario === 'empty' ? 'no_data' : 'complete', {
                geocodes: [{ location: scenario === 'invalid'
                  ? { lng: 190, lat: 91 }
                  : { lng: 113.1234567, lat: 22.1234567 } }]
              });
            }
          } }) };
        }`
        })
      )
      await page.goto(`/tests/e2e/fixtures/geocode-timeout.html?mode=${mode}`)
      const action = page.getByRole('button', {
        name: mode === 'geocode' ? '解析地址' : '估算路线',
        exact: true
      })
      await action.click()
      if (scenario === 'timeout') {
        await expect(action).toBeDisabled()
        await page.clock.fastForward(10_001)
      }
      const expected =
        mode === 'geocode'
          ? {
              success: '113.123457,22.123457',
              empty: '未找到地址',
              invalid: '未找到地址',
              timeout: '地址解析超时，请稍后重试',
              throw: '地址服务暂不可用，请稍后重试'
            }
          : {
              success: '12.35,11',
              empty: '未获取到可用的驾车路线',
              invalid: '路线估算结果不完整',
              timeout: '路线估算超时',
              throw: '地址服务暂不可用，请稍后重试'
            }
      await expect(page.getByTestId('result')).toHaveText(expected[scenario])
      await expect(action).toBeEnabled()
      expect(errors).toEqual([])
    })
  }
}
