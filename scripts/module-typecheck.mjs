import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export function createModuleTypecheckConfig(applicationRoot, platformRoot, compilerOptions) {
  const paths = { ...compilerOptions.paths }
  const packagePrefix = 'node_modules/art-supabase-pro/'
  for (const [alias, alternatives] of Object.entries(paths)) {
    const platformPath = alternatives.find((candidate) => candidate.startsWith(packagePrefix))
    if (platformPath) {
      paths[alias] = [path.join(platformRoot, platformPath.slice(packagePrefix.length))]
    }
  }
  return {
    extends: path.join(applicationRoot, 'tsconfig.json'),
    compilerOptions: { baseUrl: compilerOptions.baseUrl ?? applicationRoot, paths }
  }
}

export function typecheckModule({ applicationRoot, platformRoot }) {
  const require = createRequire(path.join(applicationRoot, 'package.json'))
  const ts = require('typescript')
  const configPath = path.join(applicationRoot, 'tsconfig.json')
  const source = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = source.error
    ? { errors: [source.error] }
    : ts.parseJsonConfigFileContent(source.config, ts.sys, applicationRoot)
  if (parsed.errors.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => applicationRoot,
        getNewLine: () => '\n'
      })
    )
  }
  const directory = path.join(applicationRoot, '.artifacts')
  mkdirSync(directory, { recursive: true })
  const temporaryConfig = path.join(directory, `module-typecheck-${randomUUID()}.json`)
  writeFileSync(
    temporaryConfig,
    JSON.stringify(createModuleTypecheckConfig(applicationRoot, platformRoot, parsed.options)),
    { flag: 'wx' }
  )
  try {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('vue-tsc/bin/vue-tsc.js'),
        '--project',
        temporaryConfig,
        '--noEmit',
        '--pretty',
        'false'
      ],
      { cwd: applicationRoot, stdio: 'inherit' }
    )
    if (result.error) throw result.error
    return result.status ?? 1
  } finally {
    unlinkSync(temporaryConfig)
  }
}
