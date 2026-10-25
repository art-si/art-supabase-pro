import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { uniq } from 'lodash-es'
import type { TableColumnCatalog, TableColumnSetting } from '../src/types/table-column-config'

interface MenuRow {
  id: string
  component: string | null
  type: string
  path: string
  parent_id: string | null
}
interface Source {
  file: string
  ast: ts.SourceFile
  template: string
  symbols: Map<string, ts.Node>
  imports: Map<string, { file: string; name: string }>
}
type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value }
const root = path.resolve(import.meta.dirname, '..')
const sources = new Map<string, Source>()
const ignoredProperties = new Set([
  'formatter',
  'link',
  'rules',
  'filterMethod',
  'render',
  'onClick'
])

function resolveFile(candidate: string): string | undefined {
  return [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.vue`,
    path.join(candidate, 'index.ts'),
    path.join(candidate, 'index.vue')
  ].find((file) => fs.existsSync(file) && fs.statSync(file).isFile())
}

function importFile(file: string, specifier: string): string | undefined {
  const moduleAlias = specifier.match(/^@([a-z]+)\/(.*)$/)
  if (moduleAlias && fs.existsSync(path.join(root, `modules/art-supabase-${moduleAlias[1]}`)))
    return resolveFile(
      path.join(root, `modules/art-supabase-${moduleAlias[1]}/src`, moduleAlias[2])
    )
  if (specifier.startsWith('@/')) return resolveFile(path.join(root, 'src', specifier.slice(2)))
  if (specifier.startsWith('@views/'))
    return resolveFile(path.join(root, 'src/views', specifier.slice(7)))
  if (specifier.startsWith('.')) return resolveFile(path.resolve(path.dirname(file), specifier))
  return undefined
}

function load(file: string): Source {
  const cached = sources.get(file)
  if (cached) return cached
  const text = fs.readFileSync(file, 'utf8')
  const sfc = file.endsWith('.vue') ? parse(text, { filename: file }).descriptor : undefined
  const code = sfc
    ? [sfc.script?.content, sfc.scriptSetup?.content].filter(Boolean).join('\n')
    : text
  const source: Source = {
    file,
    ast: ts.createSourceFile(`${file}.tsx`, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    template: (sfc?.template?.content ?? '').replace(
      /<Art(?:Dialog|Drawer)\b[\s\S]*?<\/Art(?:Dialog|Drawer)\s*>/g,
      ''
    ),
    symbols: new Map(),
    imports: new Map()
  }
  sources.set(file, source)
  for (const statement of source.ast.statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer)
          source.symbols.set(declaration.name.text, declaration.initializer)
      }
    if (ts.isFunctionDeclaration(statement) && statement.name)
      source.symbols.set(statement.name.text, statement)
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = importFile(file, statement.moduleSpecifier.text)
      if (!target) continue
      const clause = statement.importClause
      if (clause?.name) source.imports.set(clause.name.text, { file: target, name: 'default' })
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const binding of clause.namedBindings.elements)
          source.imports.set(binding.name.text, {
            file: target,
            name: binding.propertyName?.text ?? binding.name.text
          })
    }
  }
  return source
}

function propertyName(node: ts.PropertyName): string {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    ? node.text
    : ''
}
function object(value: Value): value is { [key: string]: Value } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Static metadata evaluator: never executes application code or renderer callbacks. */
function evaluate(
  node: ts.Node | undefined,
  source: Source,
  locals = new Map<string, Value>(),
  stack = new Set<ts.Node>()
): Value {
  if (!node || stack.has(node) || stack.size > 45) return undefined
  const next = new Set(stack).add(node)
  const ev = (child: ts.Node | undefined) => evaluate(child, source, locals, next)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    return ev(node.expression)
  if (ts.isIdentifier(node)) {
    if (locals.has(node.text)) return locals.get(node.text)
    const imported = source.imports.get(node.text)
    if (imported)
      return evaluate(
        load(imported.file).symbols.get(imported.name),
        load(imported.file),
        locals,
        next
      )
    return ev(source.symbols.get(node.text))
  }
  if (ts.isArrayLiteralExpression(node))
    return node.elements.flatMap((item) =>
      ts.isSpreadElement(item) ? ((ev(item.expression) as Value[]) ?? []) : [ev(item)]
    )
  if (ts.isObjectLiteralExpression(node)) {
    const value: { [key: string]: Value } = {}
    for (const item of node.properties) {
      if (ts.isSpreadAssignment(item)) {
        const spread = ev(item.expression)
        if (object(spread)) Object.assign(value, spread)
      } else if (ts.isPropertyAssignment(item)) {
        const key = propertyName(item.name)
        if (!ignoredProperties.has(key)) value[key] = ev(item.initializer)
      } else if (ts.isShorthandPropertyAssignment(item)) value[item.name.text] = ev(item.name)
    }
    return value
  }
  if (ts.isPropertyAccessExpression(node)) {
    const value = ev(node.expression)
    return object(value) ? value[node.name.text] : undefined
  }
  if (ts.isElementAccessExpression(node)) {
    const value = ev(node.expression)
    if (!object(value)) return undefined
    // A keyed factory renders several list variants on the same menu. Keep their complete sets.
    const variants = Object.entries(value).filter(([, columns]) => Array.isArray(columns))
    if (variants.length && variants.length === Object.keys(value).length)
      return variants.flatMap(([group, columns]) =>
        (columns as Value[]).map((column) =>
          object(column) ? { ...column, groups: [group] } : column
        )
      )
    const key = ev(node.argumentExpression)
    return typeof key === 'string' || typeof key === 'number' ? value[String(key)] : undefined
  }
  if (ts.isConditionalExpression(node)) {
    const yes = ev(node.whenTrue),
      no = ev(node.whenFalse)
    return Array.isArray(yes) || Array.isArray(no)
      ? [...(Array.isArray(yes) ? yes : []), ...(Array.isArray(no) ? no : [])]
      : (yes ?? no)
  }
  if (ts.isBinaryExpression(node)) return ev(node.right) ?? ev(node.left)
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
    return ev(node.body)
  if (ts.isBlock(node)) {
    const env = new Map(locals)
    const values: Value[] = []
    for (const statement of node.statements) {
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name))
            env.set(declaration.name.text, evaluate(declaration.initializer, source, env, next))
      if (ts.isReturnStatement(statement))
        values.push(evaluate(statement.expression, source, env, next))
    }
    return values.find(Array.isArray) ?? values[0]
  }
  if (ts.isCallExpression(node)) {
    if (ts.isElementAccessExpression(node.expression)) return ev(node.expression)
    const name = node.expression.getText(source.ast)
    if (
      ['computed', 'ref', 'shallowRef', 'reactive', 'readonly', 'unref', 'toValue'].includes(name)
    )
      return ev(node.arguments[0])
    if (name === 'h' || name.startsWith('$t') || name.endsWith('.t')) return ev(node.arguments[0])
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ['filter', 'map', 'flatMap'].includes(node.expression.name.text)
    ) {
      const items = ev(node.expression.expression)
      if (!Array.isArray(items)) return undefined
      if (node.expression.name.text === 'filter') return items
      const callback = node.arguments[0]
      if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)))
        return items
      return items.flatMap((item, index) => {
        const env = new Map(locals)
        callback.parameters.forEach((parameter, i) => {
          if (ts.isIdentifier(parameter.name)) env.set(parameter.name.text, i === 0 ? item : index)
        })
        const value = evaluate(callback.body, source, env, next)
        return node.expression.getText(source.ast).endsWith('.flatMap') && Array.isArray(value)
          ? value
          : [value]
      })
    }
    if (ts.isIdentifier(node.expression)) {
      const imported = source.imports.get(node.expression.text)
      const target = imported ? load(imported.file) : source
      const fn = target.symbols.get(imported?.name ?? node.expression.text)
      if (
        fn &&
        (ts.isArrowFunction(fn) || ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn))
      ) {
        const env = new Map(locals)
        fn.parameters.forEach((parameter, i) => {
          if (ts.isIdentifier(parameter.name))
            env.set(
              parameter.name.text,
              ev(node.arguments[i]) ?? evaluate(parameter.initializer, target, env, next)
            )
        })
        return evaluate(fn.body, target, env, next)
      }
    }
  }
  return undefined
}

function settings(value: Value, parentKey?: string): TableColumnSetting[] {
  if (!Array.isArray(value)) return []
  const extracted = value.filter(object).flatMap((column): TableColumnSetting[] => {
    const key =
      typeof column.type === 'string'
        ? `__${column.type}__`
        : typeof column.prop === 'string'
          ? column.prop
          : Array.isArray(column.children) && typeof column.label === 'string'
            ? `__group__${column.label}`
            : ''
    if (!key) return []
    const label =
      typeof column.label === 'string'
        ? column.label
        : ({
            __selection__: '选择',
            __index__: '序号',
            __globalIndex__: '序号',
            __expand__: '展开'
          }[key] ?? key)
    return [
      {
        key,
        ...(parentKey ? { parentKey } : {}),
        label,
        visible: typeof column.visible === 'boolean' ? column.visible : column.checked !== false,
        ...(Array.isArray(column.groups)
          ? { groups: column.groups.filter((group): group is string => typeof group === 'string') }
          : {}),
        ...(Number(column.width) > 0 ? { width: Number(column.width) } : {}),
        ...(Number(column.minWidth) > 0 ? { minWidth: Number(column.minWidth) } : {}),
        fixed:
          column.fixed === true
            ? 'left'
            : column.fixed === 'left' || column.fixed === 'right'
              ? column.fixed
              : false,
        align: column.align === 'center' || column.align === 'right' ? column.align : 'left',
        sortable: Boolean(column.sortable),
        locked: Boolean(column.type || column.prop === 'operation' || column.disabled)
      },
      ...settings(column.children, key)
    ]
  })
  const unique = new Map<string, TableColumnSetting>()
  extracted.forEach((column) => {
    const existing = unique.get(column.key)
    if (existing && (existing.groups || column.groups))
      existing.groups = uniq([...(existing.groups ?? []), ...(column.groups ?? [])])
    else if (!existing) unique.set(column.key, column)
  })
  return [...unique.values()]
}

function expression(text: string): ts.Expression | undefined {
  const ast = ts.createSourceFile(
    'expression.ts',
    `const value = ${text}`,
    ts.ScriptTarget.Latest,
    true
  )
  const statement = ast.statements[0]
  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0].initializer
    : undefined
}

function templateColumns(source: Source): TableColumnSetting[] {
  const table = source.template.match(/<ArtTable(?:Query)?\b[\s\S]*?<\/ArtTable(?:Query)?\s*>/)
  if (!table) return []
  const values: Value[] = []
  for (const match of table[0].matchAll(/<ElTableColumn\b([^>]*?)(?:\/?>)/g)) {
    const column: { [key: string]: Value } = {}
    for (const attr of match[1].matchAll(
      /(?:^|\s)(:?)(prop|label|type|width|min-width|fixed|sortable|align)(?:="([^"]*)")?/g
    )) {
      const key = attr[2] === 'min-width' ? 'minWidth' : attr[2]
      column[key] = attr[1] && attr[3] ? evaluate(expression(attr[3]), source) : (attr[3] ?? true)
    }
    if (
      typeof column.label !== 'string' &&
      typeof column.prop !== 'string' &&
      typeof column.type !== 'string'
    )
      continue
    if (!column.prop && !column.type)
      column.prop = column.label === '操作' ? 'operation' : `__slot__${column.label}`
    values.push(column)
    const conditionalLabel = match[1].match(/:label="[^"?]+\?\s*'([^']+)'\s*:\s*'([^']+)'"/)
    if (conditionalLabel && !column.type && String(column.prop).startsWith('__slot__'))
      for (const label of conditionalLabel.slice(1))
        values.push({ ...column, label, prop: `__slot__${label}` })
  }
  return settings(values)
}

function locateTable(
  file: string,
  seen = new Set<string>()
): { source: Source; columns: TableColumnSetting[]; searchKeys: string[] } | undefined {
  if (seen.has(file)) return undefined
  seen.add(file)
  const source = load(file)
  const table = source.template.match(/<ArtTable(?:Query)?\b[\s\S]*?>/)
  if (table) {
    const binding = table[0].match(/:(?:columns-factory|table-columns|columns)="([^"]+)"/)
    let columns = binding ? settings(evaluate(expression(binding[1]), source)) : []
    if (!columns.length)
      columns = settings(
        evaluate(
          source.symbols.get('columnsFactory') ??
            source.symbols.get('tableColumns') ??
            source.symbols.get('columns'),
          source
        )
      )
    if (!columns.length) {
      // Legacy useTable declares the factory inside its options rather than as a symbol.
      const candidates: TableColumnSetting[][] = []
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'columnsFactory')
          candidates.push(settings(evaluate(node.initializer, source)))
        ts.forEachChild(node, visit)
      }
      visit(source.ast)
      columns = candidates.sort((a, b) => b.length - a.length)[0] ?? []
    }
    if (!columns.length) columns = templateColumns(source)
    if (columns.length) {
      const search = evaluate(source.symbols.get('searchItems'), source)
      return {
        source,
        columns,
        searchKeys: Array.isArray(search)
          ? search
              .filter(object)
              .flatMap((item) => (typeof item.prop === 'string' ? [item.prop] : []))
          : []
      }
    }
  }
  // Follow rendered workspace components only; dialogs and imported utilities are not main lists.
  const rendered = [...source.template.matchAll(/<([A-Z][A-Za-z0-9]+)\b/g)].map((match) => match[1])
  for (const component of rendered) {
    if (
      /Dialog|Drawer|Detail|Picker|Select|Header|Filter|Panel|Toolbar|Actions|Guard/.test(component)
    )
      continue
    const imported = source.imports.get(component)
    if (imported?.file.endsWith('.vue')) {
      const found = locateTable(imported.file, seen)
      if (found) return found
    }
  }
  return undefined
}

export function generateColumnCatalog(menus: MenuRow[]): {
  catalogs: TableColumnCatalog[]
  unregistered: Array<{ menuId: string; routePath: string; reason: string }>
} {
  const catalogs: TableColumnCatalog[] = [],
    unregistered: Array<{ menuId: string; routePath: string; reason: string }> = []
  for (const menu of menus.filter(
    (item) => item.type === 'menu' && item.component?.startsWith('/')
  )) {
    const component = menu.component!.replace(/\/index$/, '')
    // This schema editor is the control plane, not a configurable business list.
    if (component === '/system/column-config') continue
    const segments = component.split('/').filter(Boolean)
    const entry =
      resolveFile(path.join(root, 'src/views', component, 'index.vue')) ??
      resolveFile(
        path.join(
          root,
          `modules/art-supabase-${segments[0]}/src/views`,
          ...segments.slice(1),
          'index.vue'
        )
      )
    const found = entry ? locateTable(entry) : undefined
    if (!found) {
      unregistered.push({
        menuId: menu.id,
        routePath: component,
        reason: entry ? '未检测到可静态提取的主列表' : '非本地列表入口'
      })
      continue
    }
    const sourceFile = path.relative(root, found.source.file).replaceAll('\\', '/')
    catalogs.push({
      menuId: menu.id,
      routePath: component,
      sourceFile,
      columns: found.columns,
      searchKeys: found.searchKeys,
      revision: createHash('sha256')
        .update(JSON.stringify(found.columns))
        .digest('hex')
        .slice(0, 16)
    })
  }
  return { catalogs, unregistered }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const menus = JSON.parse(
    fs.readFileSync(process.argv[2] || '.artifacts/column-config/menu-backup.json', 'utf8')
  ) as MenuRow[]
  const result = generateColumnCatalog(menus)
  fs.mkdirSync('src/config', { recursive: true })
  fs.writeFileSync(
    'src/config/table-column-catalog.generated.json',
    `${JSON.stringify(result.catalogs, null, 2)}\n`
  )
  fs.writeFileSync(
    'src/config/table-column-routes.generated.json',
    `${JSON.stringify(result.catalogs.map((catalog) => catalog.routePath).sort(), null, 2)}\n`
  )
  fs.writeFileSync(
    '.artifacts/column-config/inventory.json',
    `${JSON.stringify(result, null, 2)}\n`
  )
  console.info(
    JSON.stringify({
      menus: menus.filter((m) => m.type === 'menu').length,
      catalogs: result.catalogs.length,
      columns: result.catalogs.reduce((n, c) => n + c.columns.length, 0),
      unregistered: result.unregistered.length
    })
  )
}
