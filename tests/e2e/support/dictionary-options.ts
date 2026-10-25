import type { Page } from '@playwright/test'

type DictionaryChoices = Record<string, Array<{ value: string; label: string }>>

/** Keep isolated browser tests aligned with the configurable choices used by the page. */
export async function installDictionaryOptions(
  page: Page,
  choices: DictionaryChoices
): Promise<void> {
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    const requestedCode = query.get('dict_type_table.code')?.replace(/^eq\./, '')
    const rows = Object.entries(choices).flatMap(([code, options]) =>
      options.map((option, index) => ({
        id: `${code}-${option.value}`,
        type_id: code,
        code: option.value,
        label: option.label,
        value: option.value,
        status: '1',
        sort: (index + 1) * 10,
        tag_type: 'info',
        dict_type_table: { code, name: code }
      }))
    )
    return route.fulfill({
      json: requestedCode ? rows.filter((row) => row.dict_type_table.code === requestedCode) : rows
    })
  })
}
