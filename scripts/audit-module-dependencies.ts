import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { isPlainObjectRecord } from '../src/utils/type-guards'
import { hostedApplicationSourceDirectories } from './hosted-module-dependencies.mjs'

const findings = new Set<string>()
let checkedFiles = 0
const syncPatches = process.argv.includes('--sync-patches')
const dependencyPatches = (await readdir('patches')).filter((name) => name.endsWith('.patch'))
const platformWorkspaceConfig = await readFile('pnpm-workspace.yaml', 'utf8')
for (const patchName of dependencyPatches) {
  const patchSetting = `  ${patchName.slice(0, -6)}: patches/${patchName}`
  if (!platformWorkspaceConfig.split(/\r?\n/).includes(patchSetting)) {
    findings.add(`主仓 pnpm-workspace.yaml 缺少共享依赖补丁 ${patchName}`)
  }
}

const platformManifest: unknown = JSON.parse(await readFile('package.json', 'utf8'))
if (!isPlainObjectRecord(platformManifest) || !Array.isArray(platformManifest.files)) {
  throw new Error('平台 package.json 必须声明发布文件清单')
}
const publishedPaths = platformManifest.files.filter(
  (entry): entry is string => typeof entry === 'string'
)
const platformDependencies = new Set(
  ['dependencies', 'peerDependencies', 'devDependencies'].flatMap((key) => {
    const dependencies = platformManifest[key]
    return isPlainObjectRecord(dependencies) ? Object.keys(dependencies) : []
  })
)
for (const publishedPath of publishedPaths) {
  if (!publishedPath.startsWith('scripts/') || !publishedPath.endsWith('.mjs')) continue
  const content = await readFile(publishedPath, 'utf8')
  const source = ts.createSourceFile(publishedPath, content, ts.ScriptTarget.Latest, true)
  for (const statement of source.statements) {
    if (
      !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith('.')
    )
      continue
    const dependencyPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(publishedPath), statement.moduleSpecifier.text)
    )
    if (
      !publishedPaths.some(
        (entry) => dependencyPath === entry || dependencyPath.startsWith(`${entry}/`)
      )
    ) {
      findings.add(`${publishedPath}: 发布文件清单缺少构建依赖 ${dependencyPath}`)
    }
  }
}

for (const sourceDirectory of Object.values(hostedApplicationSourceDirectories)) {
  const moduleRoot = path.resolve(sourceDirectory, '..')
  const manifest: unknown = JSON.parse(
    await readFile(path.join(moduleRoot, 'package.json'), 'utf8')
  )
  if (!isPlainObjectRecord(manifest)) throw new Error(`${moduleRoot}: package.json 格式无效`)
  const declared = new Set(
    ['dependencies', 'peerDependencies', 'devDependencies'].flatMap((key) => {
      const dependencies = manifest[key]
      return isPlainObjectRecord(dependencies) ? Object.keys(dependencies) : []
    })
  )
  // Standalone module installs need local copies; the platform owns their contents.
  for (const patchName of dependencyPatches) {
    const dependency = patchName.slice(0, patchName.lastIndexOf('@'))
    if (!declared.has(dependency)) continue
    const canonicalPatch = await readFile(path.join('patches', patchName), 'utf8')
    const modulePatch = path.join(moduleRoot, 'patches', patchName)
    if (syncPatches) {
      await mkdir(path.dirname(modulePatch), { recursive: true })
      await writeFile(modulePatch, canonicalPatch)
    }
    const workspaceConfig = await readFile(path.join(moduleRoot, 'pnpm-workspace.yaml'), 'utf8')
    const patchSetting = `  ${patchName.slice(0, -6)}: patches/${patchName}`
    if (!workspaceConfig.split(/\r?\n/).includes(patchSetting)) {
      findings.add(`${moduleRoot}: pnpm-workspace.yaml 缺少共享依赖补丁 ${patchName}`)
    }
    const installedCopy = await readFile(modulePatch, 'utf8').catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
      throw error
    })
    if (installedCopy !== canonicalPatch) {
      findings.add(
        `${moduleRoot}: 依赖补丁 ${patchName} 与主仓不一致，请运行 dependencies:sync-patches`
      )
    }
  }
  const config = ts.readConfigFile(path.join(moduleRoot, 'tsconfig.json'), ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, moduleRoot)
  const aliases = Object.keys(parsedConfig.options.paths ?? {})
  const entries = await readdir(path.resolve(sourceDirectory), {
    recursive: true,
    withFileTypes: true
  })
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:ts|tsx|vue)$/.test(entry.name)) continue
    const file = path.join(entry.parentPath, entry.name)
    const content = await readFile(file, 'utf8')
    const blocks = file.endsWith('.vue')
      ? (() => {
          const { descriptor, errors } = parse(content, { filename: file })
          if (errors.length) throw new Error(`${file}: Vue 源码解析失败`)
          return [descriptor.script?.content, descriptor.scriptSetup?.content].filter(
            (block): block is string => block !== undefined
          )
        })()
      : [content]
    checkedFiles++
    for (const block of blocks) {
      const source = ts.createSourceFile(
        file,
        block,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      )
      function check(specifier: string): void {
        if (
          specifier.startsWith('.') ||
          specifier.startsWith('/') ||
          isBuiltin(specifier) ||
          aliases.some((alias) => {
            const wildcard = alias.indexOf('*')
            return wildcard === -1
              ? specifier === alias
              : specifier.startsWith(alias.slice(0, wildcard)) &&
                  specifier.endsWith(alias.slice(wildcard + 1))
          })
        )
          return
        const dependency = specifier
          .split('/')
          .slice(0, specifier.startsWith('@') ? 2 : 1)
          .join('/')
        if (!declared.has(dependency)) {
          findings.add(`${path.relative(process.cwd(), file)}: 未声明依赖 ${dependency}`)
        }
        if (!platformDependencies.has(dependency)) {
          findings.add(`${path.relative(process.cwd(), file)}: 聚合宿主未声明依赖 ${dependency}`)
        }
      }
      function visit(node: ts.Node): void {
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          check(node.argument.literal.text)
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          check(node.moduleSpecifier.text)
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          check(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
}

if (findings.size) {
  console.error(['模块依赖审计失败：', ...findings].join('\n'))
  process.exitCode = 1
} else {
  console.log(`模块依赖审计通过：${checkedFiles} 个源码文件。`)
}
