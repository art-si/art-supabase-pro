import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { parse as parseSfc, type SFCDescriptor } from '@vue/compiler-sfc'

interface HelperOccurrence {
  body: string
  file: string
  name: string
  owner: string
}

interface Finding {
  detail: string
  file: string
  rule: string
}

const projectRoot = process.cwd()
const helperName =
  /^(normalize|format|parse|build|to|is|has|map|optional|required|resolve|sanitize|coerce|ensure)[A-Z_]/
const supportedExtensions = new Set(['.ts', '.tsx', '.vue'])
const utilityFileName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.(?:test|spec|d))?\.tsx?$/
const canonicalDeclarations = new Map<string, string>([
  ['formatAvatarInitials', 'src/utils/ui/format.ts'],
  ['printHtmlDocument', 'src/utils/file/print-document.ts'],
  ['formatDurationMs', 'src/utils/ui/format.ts'],
  ['formatNumberValue', 'src/utils/ui/format.ts'],
  ['formatCurrencyValue', 'src/utils/ui/format.ts'],
  ['formatCurrencyCodeValue', 'src/utils/ui/format.ts'],
  ['buildSupabaseRpcRange', 'src/utils/supabase/pagination.ts'],
  ['toDateStartTimestamp', 'src/utils/time/date-boundary.ts'],
  ['toDateEndTimestamp', 'src/utils/time/date-boundary.ts'],
  ['normalizeNonNullableText', 'src/utils/form/normalize.ts'],
  ['normalizeNullableText', 'src/utils/form/normalize.ts'],
  ['normalizeNullableNumber', 'src/utils/form/normalize.ts'],
  ['normalizeImportedEnabled', 'src/utils/form/normalize.ts'],
  ['requireUniqueImportReference', 'src/utils/business/import-reference.ts'],
  ['normalizeStringList', 'src/utils/form/normalize.ts'],
  ['normalizeSingleStringKey', 'src/utils/form/normalize.ts'],
  ['toDictionaryOption', 'src/utils/form/option.ts'],
  ['toNameCodeOption', 'src/utils/form/option.ts'],
  ['formatTenantLabel', 'src/utils/tenant-display.ts'],
  ['formatCnyCurrencyValue', 'src/utils/ui/format.ts'],
  ['formatSensitiveCurrencyValue', 'src/utils/ui/format.ts'],
  ['formatSensitiveCountValue', 'src/utils/ui/format.ts'],
  ['parseReadableSensitiveNumber', 'src/utils/field-permission.ts'],
  ['isReadableFieldAccess', 'src/utils/field-permission.ts'],
  ['formatDateTimeValue', 'src/utils/ui/format.ts'],
  ['formatPercentValue', 'src/utils/ui/format.ts'],
  ['createDateTimeFormatter', 'src/utils/ui/format.ts'],
  ['createMenuPathResolver', 'src/utils/navigation/menu.ts']
])

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectFiles(resolved)
      return supportedExtensions.has(path.extname(entry.name)) ? [resolved] : []
    })
  )
  return nested.flat()
}

async function collectFrontendFiles(): Promise<string[]> {
  const files = await collectFiles(path.join(projectRoot, 'src'))
  const moduleEntries = await readdir(path.join(projectRoot, 'modules'), { withFileTypes: true })
  for (const entry of moduleEntries.filter((item) => item.isDirectory())) {
    const sourceRoot = path.join(projectRoot, 'modules', entry.name, 'src')
    try {
      await stat(sourceRoot)
    } catch (error) {
      // Some optional repositories intentionally have no frontend source directory.
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    files.push(...(await collectFiles(sourceRoot)))
  }
  return files
}

function relativeFile(file: string): string {
  return path.relative(projectRoot, file).replaceAll('\\', '/')
}

function isTransparentMainComponentWrapper(descriptor: SFCDescriptor, file: string): boolean {
  if (descriptor.script?.content.trim() || descriptor.styles.some((block) => block.content.trim()))
    return false
  const template = descriptor.template?.content.replace(/<!--[\s\S]*?-->/g, '').trim() ?? ''
  const match = /^<([A-Z]\w*)>\s*<slot\s*\/>\s*<\/\1>$/.exec(template)
  if (!match || !descriptor.scriptSetup) return false
  const script = ts.createSourceFile(
    file,
    descriptor.scriptSetup.content,
    ts.ScriptTarget.Latest,
    true
  )
  let importsCanonicalComponent = false
  for (const statement of script.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.startsWith('@/components/')
      ) {
        const clause = statement.importClause
        const bindings = clause?.namedBindings
        importsCanonicalComponent ||=
          clause?.name?.text === match[1] ||
          Boolean(
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.some((item) => item.name.text === match[1])
          )
      }
      continue
    }
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
      return false
    const call = statement.expression
    if (call.expression.getText(script) !== 'defineOptions' || call.arguments.length !== 1)
      return false
    const options = call.arguments[0]
    if (
      !ts.isObjectLiteralExpression(options) ||
      options.properties.some(
        (property) =>
          !ts.isPropertyAssignment(property) ||
          !ts.isIdentifier(property.name) ||
          property.name.text !== 'name' ||
          !ts.isStringLiteral(property.initializer)
      )
    )
      return false
  }
  return importsCanonicalComponent
}

function ownerOf(file: string): string {
  const segments = relativeFile(file).split('/')
  return segments[0] === 'modules' ? segments[1] : 'root'
}

function normalizeBody(body: ts.Node, source: ts.SourceFile): string {
  return body
    .getText(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '')
    .replace(/\s+/g, '')
}

function isCopiedCurrencyFormatter(body: ts.Node): boolean {
  const owner = body.parent
  if (
    !ts.isFunctionDeclaration(owner) &&
    !ts.isFunctionExpression(owner) &&
    !ts.isArrowFunction(owner)
  ) {
    return false
  }
  const parameter = owner.parameters[0]?.name
  if (!parameter || !ts.isIdentifier(parameter)) return false
  while (ts.isParenthesizedExpression(body)) body = body.expression
  const isValue = (node: ts.Node): boolean => ts.isIdentifier(node) && node.text === parameter.text
  const isCurrencyCall = (node: ts.Node): boolean =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['formatCurrencyValue', 'formatSensitiveCurrencyValue'].includes(node.expression.text) &&
    Boolean(node.arguments[0] && isValue(node.arguments[0]))
  const emptyChecks = (node: ts.Node): string[] => {
    if (!ts.isBinaryExpression(node)) return []
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const left = emptyChecks(node.left)
      const right = emptyChecks(node.right)
      return left.length && right.length ? [...left, ...right] : []
    }
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken || !isValue(node.left)) {
      return []
    }
    if (node.right.kind === ts.SyntaxKind.NullKeyword) return ['null']
    if (ts.isIdentifier(node.right) && node.right.text === 'undefined') return ['undefined']
    if (ts.isStringLiteral(node.right) && node.right.text === '') return ['blank']
    return []
  }
  const isUnavailable = (node: ts.Node): boolean => ts.isStringLiteral(node) && node.text === '--'
  if (ts.isConditionalExpression(body)) {
    return (
      emptyChecks(body.condition).join() === 'undefined' &&
      isUnavailable(body.whenTrue) &&
      isCurrencyCall(body.whenFalse)
    )
  }
  if (!ts.isBlock(body)) return isCurrencyCall(body)
  const statements = body.statements
  const last = statements.at(-1)
  if (
    !last ||
    !ts.isReturnStatement(last) ||
    !last.expression ||
    !isCurrencyCall(last.expression)
  ) {
    return false
  }
  if (statements.length === 1) return true
  const guard = statements[0]
  return (
    statements.length === 2 &&
    ts.isIfStatement(guard) &&
    !guard.elseStatement &&
    emptyChecks(guard.expression).sort().join() === 'blank,null,undefined' &&
    ts.isReturnStatement(guard.thenStatement) &&
    Boolean(guard.thenStatement.expression && isUnavailable(guard.thenStatement.expression))
  )
}

function collectScriptHelpers(
  content: string,
  file: string,
  occurrences: HelperOccurrence[],
  findings: Finding[]
): void {
  const relative = relativeFile(file)
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const inspectSharedTransforms = (node: ts.Node): void => {
    if (
      /(?:^|\/)src\/(?:views|components)\//.test(relative) &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'window' &&
      node.expression.name.text === 'print'
    ) {
      findings.push({
        file: relative,
        rule: 'reuse/shared-print-lifecycle',
        detail: '页面内打印必须复用 usePrintSheet 管理打印状态与清理。'
      })
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'find' &&
      /\bgetDictMap\b/.test(node.expression.expression.getText(source))
    ) {
      const predicate = node.arguments[0]
      if (
        predicate &&
        ts.isArrowFunction(predicate) &&
        predicate.parameters.length === 1 &&
        ts.isIdentifier(predicate.parameters[0].name) &&
        ts.isBinaryExpression(predicate.body) &&
        predicate.body.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      ) {
        const value = `${predicate.parameters[0].name.text}.value`
        const sides = [predicate.body.left, predicate.body.right].map((side) =>
          normalizeBody(side, source)
        )
        if (sides.some((side) => side === value || side === `String(${value})`)) {
          findings.push({
            file: relative,
            rule: 'repeated-dictionary-value-lookup',
            detail:
              '按值查找字典项或标签请复用用户 Store 的 getDictItemByValue / getDictLabelByValue。'
          })
        }
      }
    }
    if (
      ts.isConditionalExpression(node) &&
      ts.isIdentifier(node.condition) &&
      ts.isStringLiteral(node.whenFalse) &&
      ts.isCallExpression(node.whenTrue) &&
      ts.isPropertyAccessExpression(node.whenTrue.expression) &&
      node.whenTrue.expression.name.text === 'format' &&
      ts.isCallExpression(node.whenTrue.expression.expression) &&
      ts.isIdentifier(node.whenTrue.expression.expression.expression) &&
      node.whenTrue.expression.expression.expression.text === 'dayjs' &&
      node.whenTrue.expression.expression.arguments.length === 1 &&
      node.whenTrue.expression.expression.arguments[0].getText(source) === node.condition.text
    ) {
      findings.push({
        file: relative,
        rule: 'copied-date-formatter',
        detail: '日期显示请配置主仓 createDateTimeFormatter，统一空值、异常日期和显示精度。'
      })
    }
    if (relative !== 'src/utils/field-permission.ts') {
      const copiedArrayCheck =
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'includes' &&
        ts.isArrayLiteralExpression(node.expression.expression) &&
        node.expression.expression.elements.length === 2 &&
        node.expression.expression.elements.every(
          (item) => ts.isStringLiteral(item) && (item.text === 'read' || item.text === 'edit')
        ) &&
        new Set(node.expression.expression.elements.map((item) => item.getText(source))).size === 2
      const copiedLevelCheck =
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
        ts.isBinaryExpression(node.left) &&
        ts.isBinaryExpression(node.right) &&
        node.left.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        node.right.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isStringLiteral(node.left.right) &&
        ts.isStringLiteral(node.right.right) &&
        ((node.left.right.text === 'read' && node.right.right.text === 'edit') ||
          (node.left.right.text === 'edit' && node.right.right.text === 'read')) &&
        normalizeBody(node.left.left, source) === normalizeBody(node.right.left, source)
      if (copiedArrayCheck || copiedLevelCheck) {
        findings.push({
          file: relative,
          rule: 'repeated-field-readability-check',
          detail: '读取原始字段数据的权限判断请复用主仓 isReadableFieldAccess，脱敏可见不代表可读。'
        })
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'format' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const dateCall = node.expression.expression
      if (
        ts.isCallExpression(dateCall) &&
        ts.isIdentifier(dateCall.expression) &&
        dateCall.expression.text === 'dayjs' &&
        dateCall.arguments.length === 1 &&
        ts.isPropertyAccessExpression(dateCall.arguments[0])
      ) {
        let parent: ts.Node | undefined = node.parent
        while (parent && !ts.isSourceFile(parent)) {
          if (ts.isPropertyAssignment(parent) && parent.name.getText(source) === 'formatter') {
            findings.push({
              file: relative,
              rule: 'raw-table-date-formatting',
              detail:
                '表格日期展示必须复用 createDateTimeFormatter，统一处理缺失日期，避免显示当前时间。'
            })
            break
          }
          parent = parent.parent
        }
      }
    }
    if (
      ts.isArrowFunction(node) &&
      node.parameters.length === 1 &&
      ts.isIdentifier(node.parameters[0].name) &&
      ts.isCallExpression(node.parent) &&
      ts.isPropertyAccessExpression(node.parent.expression) &&
      node.parent.expression.name.text === 'map'
    ) {
      const item = node.parameters[0].name.text
      if (
        normalizeBody(node.body, source) ===
        `({label:${item}.label||${item}.name,value:${item}.value})`
      ) {
        findings.push({
          file: relative,
          rule: 'repeated-dictionary-option-mapping',
          detail: '字典选项的标签回退与值保留请复用主仓 toDictionaryOption。'
        })
      }
      const body = ts.isParenthesizedExpression(node.body) ? node.body.expression : node.body
      if (ts.isObjectLiteralExpression(body) && body.properties.length === 2) {
        const label = body.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) && property.name.getText(source) === 'label'
        )
        const value = body.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) && property.name.getText(source) === 'value'
        )
        if (
          label &&
          ts.isPropertyAssignment(label) &&
          value &&
          ts.isPropertyAssignment(value) &&
          value.initializer.getText(source) === `${item}.id` &&
          [
            ts.SyntaxKind.TemplateExpression,
            ts.SyntaxKind.ConditionalExpression,
            ts.SyntaxKind.CallExpression
          ].includes(label.initializer.kind) &&
          normalizeBody(label.initializer, source).includes(`${item}.name`) &&
          normalizeBody(label.initializer, source).includes(`${item}.code`)
        ) {
          const fields: string[] = []
          const inspectFields = (child: ts.Node): void => {
            if (ts.isPropertyAccessExpression(child) && child.expression.getText(source) === item) {
              fields.push(child.name.text)
            }
            ts.forEachChild(child, inspectFields)
          }
          inspectFields(label.initializer)
          if (fields.every((field) => field === 'name' || field === 'code')) {
            findings.push({
              file: relative,
              rule: 'repeated-name-code-option-mapping',
              detail: '名称、编码与 ID 的关联选项请复用主仓 toNameCodeOption。'
            })
          }
        }
      }
    }
    ts.forEachChild(node, inspectSharedTransforms)
  }
  inspectSharedTransforms(source)

  if (relative.includes('/api/') && !/\.(?:test|spec)\./.test(relative)) {
    const inspectApiPolicy = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'push'
      ) {
        for (const argument of node.arguments) {
          if (!ts.isSpreadElement(argument)) continue
          let value = argument.expression
          while (ts.isParenthesizedExpression(value)) value = value.expression
          if (
            ts.isBinaryExpression(value) &&
            value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          ) {
            value = value.left
          }
          if (ts.isPropertyAccessExpression(value) && value.name.text === 'data') {
            findings.push({
              file: relative,
              rule: 'spread-query-data',
              detail: '查询结果不要展开为 push 参数；收集批次后使用 flat，避免大数据量参数溢出。'
            })
          }
        }
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        ['p_from', 'p_to'].includes(node.name.text) &&
        ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        node.initializer.expression.getText(source) === 'Math.max'
      ) {
        findings.push({
          file: relative,
          rule: 'raw-rpc-range',
          detail: 'RPC 分页范围请复用主仓 buildSupabaseRpcRange，统一校验和边界顺序。'
        })
      }
      if (
        ts.isTemplateExpression(node) &&
        node.head.text === '' &&
        node.templateSpans.length === 1 &&
        ['T00:00:00', 'T23:59:59.999'].includes(node.templateSpans[0].literal.text)
      ) {
        findings.push({
          file: relative,
          rule: 'raw-date-boundary',
          detail: '无时区日期边界请复用主仓 toDateStartTimestamp 或 toDateEndTimestamp。'
        })
      }
      ts.forEachChild(node, inspectApiPolicy)
    }
    inspectApiPolicy(source)
  }

  const add = (name: string, body: ts.Node): void => {
    if (relative !== 'src/utils/ui/format.ts' && isCopiedCurrencyFormatter(body)) {
      findings.push({
        file: relative,
        rule: 'copied-currency-formatter',
        detail: `${name} 重复包装主仓金额格式化；直接使用 formatCurrencyValue 或 formatSensitiveCurrencyValue，并显式传入币种。`
      })
    }
    const canonicalFile = canonicalDeclarations.get(name)
    if (canonicalFile === relative) foundCanonicalDeclarations.add(name)
    if (canonicalFile && canonicalFile !== relative) {
      findings.push({
        file: relative,
        rule: 'canonical-helper-redeclared',
        detail: `${name} 必须从主仓 ${canonicalFile} 导入，不能在子仓或页面重复声明。`
      })
    }

    const normalized = normalizeBody(body, source)
    if (helperName.test(name) && normalized.length >= 18) {
      occurrences.push({ body: normalized, file: relative, name, owner: ownerOf(file) })
    }
  }

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      add(statement.name.text, statement.body)
      continue
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        add(declaration.name.text, declaration.initializer.body)
      }
    }
  }
}

const files = await collectFrontendFiles()
const findings: Finding[] = []
const helpers: HelperOccurrence[] = []
const foundCanonicalDeclarations = new Set<string>()
const moduleEntries = await readdir(path.join(projectRoot, 'modules'), { withFileTypes: true })

for (const entry of moduleEntries.filter((item) => item.isDirectory())) {
  const configFile = path.join(projectRoot, 'modules', entry.name, 'tsconfig.json')
  try {
    const config = JSON.parse(await readFile(configFile, 'utf8')) as {
      compilerOptions?: { paths?: Record<string, string[]> }
    }
    for (const [alias, candidates] of Object.entries(config.compilerOptions?.paths ?? {})) {
      const workspaceIndex = candidates.findIndex((candidate) => candidate.startsWith('../../src'))
      const packageIndex = candidates.findIndex((candidate) =>
        candidate.startsWith('node_modules/art-supabase-pro/src')
      )
      if (workspaceIndex !== -1 && packageIndex !== -1 && workspaceIndex > packageIndex) {
        findings.push({
          file: relativeFile(configFile),
          rule: 'main-repository-resolution-order',
          detail: `${alias} 必须先解析当前工作区主仓，再回退到 node_modules 发布包。`
        })
      }
    }
  } catch (error) {
    // Optional repositories without a TypeScript config are outside this frontend audit.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
    throw error
  }
}

for (const file of files) {
  const content = await readFile(file, 'utf8')
  const relative = relativeFile(file)
  if (relative.startsWith('src/utils/') && !utilityFileName.test(path.basename(file))) {
    findings.push({
      file: relative,
      rule: 'utility-file-name',
      detail: '共享工具文件请使用小写连字符命名；测试和声明文件保留标准后缀。'
    })
  }
  if (/\.trim\(\)\s*\|\|\s*null/.test(content)) {
    findings.push({
      file: relative,
      rule: 'raw-nullable-text-normalization',
      detail: '请按数据库列语义使用 normalizeNullableText 或 normalizeNonNullableText。'
    })
  }
  if (/\[\s*\.\.\.\s*new Set\s*\(|Array\.from\(\s*new Set\s*\(/.test(content)) {
    findings.push({
      file: relative,
      rule: 'manual-array-deduplication',
      detail: '数组去重请复用 lodash-es 的 uniq 或 uniqBy；保留 Set 用于集合成员判断。'
    })
  }

  if (file.endsWith('.vue')) {
    const { descriptor } = parseSfc(content, { filename: file })
    if (isTransparentMainComponentWrapper(descriptor, file)) {
      findings.push({
        file: relative,
        rule: 'transparent-main-component-wrapper',
        detail: '组件只转发主仓公共组件的默认插槽，请直接复用公共组件并删除空壳包装。'
      })
    }
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) collectScriptHelpers(block.content, file, helpers, findings)
    }
  } else {
    collectScriptHelpers(content, file, helpers, findings)
  }
}

for (const [name, canonicalFile] of canonicalDeclarations) {
  if (!foundCanonicalDeclarations.has(name)) {
    findings.push({
      file: canonicalFile,
      rule: 'canonical-helper-missing',
      detail: `${name} 的主仓实现缺失；不能只保留调用方或自引用导入。`
    })
  }
}

const duplicateGroups = new Map<string, HelperOccurrence[]>()
for (const helper of helpers) {
  const key = `${helper.name}\0${helper.body}`
  duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), helper])
}

for (const group of duplicateGroups.values()) {
  if (new Set(group.map((item) => item.file)).size < 2) continue
  const crossRepository = new Set(group.map((item) => item.owner)).size > 1
  findings.push({
    file: group[0].file,
    rule: crossRepository
      ? 'cross-repository-helper-duplication'
      : 'within-repository-helper-duplication',
    detail: `${group[0].name} 在 ${group.map((item) => item.file).join('、')} 重复实现；请迁移至${crossRepository ? '主仓' : '所属领域'}共享模块并迁移全部调用。`
  })
}

if (findings.length) {
  console.error(`Shared reuse audit failed with ${findings.length} finding(s):`)
  findings.forEach((finding) =>
    console.error(`- [${finding.rule}] ${finding.file}: ${finding.detail}`)
  )
  process.exitCode = 1
} else {
  console.log(`Shared reuse audit passed (${files.length} frontend source files checked).`)
}
