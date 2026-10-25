import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TENANT_SCOPE_MODE_STORAGE_KEY,
  writeTenantScopeId
} from '../../src/utils/tenant-scope-context'
import {
  buildExcelFilename,
  buildExcelRows,
  downloadBlob,
  exportExcel,
  importExcelFile,
  mapExcelRowsToRecords
} from '../../src/utils/file'

test('Excel row mapping ignores inherited columns and preserves explicit special keys', () => {
  const rows = [JSON.parse('{"__proto__":"  明确数据  ","金额":0,"启用":false}')]
  const mapped = mapExcelRowsToRecords(rows, [
    { key: '__proto__', title: '__proto__', required: true },
    { key: 'amount', title: '金额' },
    { key: 'enabled', title: '启用' }
  ])
  assert.equal(Object.getPrototypeOf(mapped[0]), Object.prototype)
  assert.equal(Object.prototype.hasOwnProperty.call(mapped[0], '__proto__'), true)
  assert.equal(mapped[0].__proto__, '明确数据')
  assert.equal(mapped[0].amount, 0)
  assert.equal(mapped[0].enabled, false)
  assert.deepEqual(
    mapExcelRowsToRecords([{}], [{ key: 'constructor', title: '客户', required: true }]),
    []
  )
})

test('spreadsheet imports preserve UTF-8 CSV headers and binary Excel files', async () => {
  const originalReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader')
  class ImportFileReader {
    onload?: (event: { target: { result: string | ArrayBuffer } }) => void
    onerror?: (error: unknown) => void

    readAsText(file: File) {
      void file.text().then(
        (result) => this.onload?.({ target: { result } }),
        (error: unknown) => this.onerror?.(error)
      )
    }

    readAsArrayBuffer(file: File) {
      void file.arrayBuffer().then(
        (result) => this.onload?.({ target: { result } }),
        (error: unknown) => this.onerror?.(error)
      )
    }
  }
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: ImportFileReader })
  try {
    const expected = [
      { 客户: '测试甲', 金额: 12 },
      { 客户: '测试乙', 金额: 18 }
    ]
    const csv = new File(['\uFEFF客户,金额\n测试甲,12\n测试乙,18'], '流水.CSV')
    assert.deepEqual(await importExcelFile(csv), expected)
    const XLSX = await import('../../src/vendor/sheetjs/xlsx.mjs')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expected), '流水')
    const excel = new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], '流水.xlsx')
    assert.deepEqual(await importExcelFile(excel), expected)
  } finally {
    if (originalReader) Object.defineProperty(globalThis, 'FileReader', originalReader)
    else Reflect.deleteProperty(globalThis, 'FileReader')
  }
})

test('Excel export rejects a tenant change before saving its generated file', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>([[TENANT_SCOPE_MODE_STORAGE_KEY, '1']])
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  })
  try {
    await assert.rejects(
      exportExcel({
        data: [{ name: '测试导出' }],
        columns: [{ key: 'name', title: '名称' }],
        onProgress: (progress) => {
          if (progress === 95) writeTenantScopeId('7529f951-938e-4e2c-ac0d-316c136ae1f9')
        }
      }),
      /租户范围已变化/
    )
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})

test('Excel export rechecks operation permission immediately before saving the workbook', async () => {
  let authorized = true
  let checked = false
  await assert.rejects(
    exportExcel({
      data: [{ name: '权限回归' }],
      columns: [{ key: 'name', title: '名称' }],
      onProgress: (progress) => {
        if (progress === 95) authorized = false
      },
      assertCanDownload: () => {
        checked = true
        if (!authorized) throw new Error('导出权限已变化')
      }
    }),
    /导出权限已变化/
  )
  assert.equal(checked, true)
})

test('Excel export rejects invalid row limits and oversized data before loading browser libraries', async () => {
  const data = [{ name: '第一条' }, { name: '第二条' }]
  const columns = [{ key: 'name' as const, title: '名称' }]
  for (const maxRows of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(exportExcel({ data, columns, maxRows }), {
      name: 'RangeError',
      message: '导出行数上限必须是正安全整数'
    })
  }
  await assert.rejects(exportExcel({ data, columns, maxRows: 1 }), {
    message: '导出数据不能超过 1 行'
  })
})

test('Excel rows preserve column policy and format supported values', () => {
  const rows = buildExcelRows(
    [{ name: '测试', amount: 0, enabled: false, createdAt: new Date('2026-09-10T00:00:00Z') }],
    [
      { key: 'name', title: '名称' },
      { key: 'amount', title: '金额' },
      { key: 'enabled', title: '启用' },
      { key: 'createdAt', title: '日期', formatter: () => '2026-09-10' }
    ],
    { autoIndex: true, indexColumnTitle: '序号' }
  )

  assert.deepEqual(rows, [{ 序号: '1', 名称: '测试', 金额: '0', 启用: '否', 日期: '2026-09-10' }])
})

test('Excel filename policy supports stable date, timestamp and no suffix', () => {
  const now = new Date('2026-09-10T07:08:09.123Z')
  assert.equal(buildExcelFilename('报表', 'date', now), '报表_2026-09-10.xlsx')
  assert.equal(buildExcelFilename('报表', 'datetime', now), '报表_2026-09-10T07-08-09-123Z.xlsx')
  assert.equal(buildExcelFilename('报表', false, now), '报表.xlsx')
})

test('blob downloads release their temporary URL after triggering the browser download', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const events: string[] = []
  const anchor = {
    href: '',
    download: '',
    target: '',
    rel: '',
    click: () => events.push('click')
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => anchor,
      body: {
        appendChild: () => events.push('append'),
        removeChild: () => events.push('remove')
      }
    }
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:download-test'
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => events.push(`revoke:${url}`)
  })

  try {
    downloadBlob(new Blob(['report']), 'report.csv')
    await new Promise((resolve) => setTimeout(resolve, 5))

    assert.equal(anchor.href, 'blob:download-test')
    assert.equal(anchor.download, 'report.csv')
    assert.deepEqual(events, ['append', 'click', 'remove', 'revoke:blob:download-test'])
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete (globalThis as { document?: unknown }).document
    if (originalCreateObjectUrl)
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
    if (originalRevokeObjectUrl)
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
  }
})
