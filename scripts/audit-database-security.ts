import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const moduleRoot = join(projectRoot, 'modules')
const regressionQueryPath = join(projectRoot, 'tests/integration/database-security-policy.sql')
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.vue'])
const internalOnlyFunctions = [
  'get_app_user_display_name',
  'validate_tms_expense_reimbursement_submission_secure',
  'validate_tms_waybill_cost_submission_secure'
]
const requiredLiveAssertions = [
  'canonical_platform_super_write',
  'canonical_tenant_read_scope',
  'mdm_cargo',
  'mdm_station',
  'tms_station_role',
  'save_tms_station',
  'tms_station_delete_guard',
  'get_tms_station_delete_dependency_details',
  'create_ai_order_master_data'
]

function walkSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []

  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry)
    if (statSync(absolutePath).isDirectory()) return walkSourceFiles(absolutePath)
    return sourceExtensions.has(extname(entry)) ? [absolutePath] : []
  })
}

const moduleDirectories = readdirSync(moduleRoot)
  .map((entry) => join(moduleRoot, entry))
  .filter((directory) => statSync(directory).isDirectory())

for (const moduleDirectory of moduleDirectories) {
  assert.equal(
    existsSync(join(moduleDirectory, 'supabase')),
    false,
    `子仓不能保留 Supabase 目录：${moduleDirectory}`
  )
}

const sourceFiles = [
  join(projectRoot, 'src'),
  join(projectRoot, 'supabase/functions'),
  ...moduleDirectories.map((moduleDirectory) => join(moduleDirectory, 'src'))
].flatMap(walkSourceFiles)

for (const filePath of sourceFiles) {
  const source = readFileSync(filePath, 'utf8')
  for (const functionName of internalOnlyFunctions) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\.rpc\\s*\\(\\s*['"]${functionName}['"]`, 'i'),
      `数据库内部函数不得成为客户端 RPC：${filePath} → public.${functionName}`
    )
  }
}

assert.ok(existsSync(regressionQueryPath), '缺少线上 RLS 与 RPC 权限回归查询')
const regressionQuery = readFileSync(regressionQueryPath, 'utf8')
for (const assertion of requiredLiveAssertions) {
  assert.ok(regressionQuery.includes(assertion), `线上权限回归查询缺少：${assertion}`)
}

console.log(
  `Database security source audit passed (${sourceFiles.length} source files). Run pnpm test:db against the linked project for live RLS/RPC checks.`
)
