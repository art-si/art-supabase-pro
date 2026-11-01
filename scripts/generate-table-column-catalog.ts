import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { uniq } from 'lodash-es'
import { format, resolveConfig } from 'prettier'
import { isTableOperationColumn } from '../src/utils/table/column-profile'
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
  templateAst: NonNullable<ReturnType<typeof parse>['descriptor']['template']>['ast']
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
    templateAst: sfc?.template?.ast,
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

function columnControlBinding(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text
  if (
    (ts.isPropertyAccessExpression(node) && node.name.text === 'value') ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  )
    return columnControlBinding(node.expression)
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['unref', 'toValue'].includes(node.expression.text) &&
    node.arguments.length === 1
  )
    return columnControlBinding(node.arguments[0])
  return undefined
}

function bindValue(name: ts.BindingName, value: Value, locals: Map<string, Value>): void {
  if (ts.isIdentifier(name)) locals.set(name.text, value)
  else if (ts.isObjectBindingPattern(name))
    for (const element of name.elements) {
      const key = element.propertyName
        ? propertyName(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : ''
      bindValue(element.name, object(value) ? value[key] : undefined, locals)
    }
  else
    name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element))
        bindValue(element.name, Array.isArray(value) ? value[index] : undefined, locals)
    })
}

function permissionCondition(node: ts.Node, source: Source): boolean {
  return /\b(?:can[A-Z]\w*|has[A-Z]\w*)\b/.test(node.getText(source.ast))
}

function recordSelector(node: ts.Expression, source: Source, locals: Map<string, Value>): void {
  const selectors = locals.get('__selectorsFound')
  if (!object(selectors) || !ts.isBinaryExpression(node) || permissionCondition(node, source))
    return
  if (
    ![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(
      node.operatorToken.kind
    )
  )
    return
  const selector = ts.isStringLiteral(node.right)
    ? node.left
    : ts.isStringLiteral(node.left)
      ? node.right
      : undefined
  if (!selector || !(ts.isIdentifier(selector) || ts.isPropertyAccessExpression(selector))) return
  const text = selector.getText(source.ast)
  const key = `${source.file}:${text}`
  if (selectors[key]) return
  const values: string[] = []
  const visit = (child: ts.Node) => {
    if (ts.isBinaryExpression(child)) {
      if (child.left.getText(source.ast) === text && ts.isStringLiteral(child.right))
        values.push(child.right.text)
      if (child.right.getText(source.ast) === text && ts.isStringLiteral(child.left))
        values.push(child.left.text)
    }
    ts.forEachChild(child, visit)
  }
  visit(source.ast)
  selectors[key] = uniq([...values, '__other__'])
}

/** Static metadata evaluator: never executes application code or renderer callbacks. */
function evaluate(
  node: ts.Node | undefined,
  source: Source,
  locals = new Map<string, Value>(),
  stack = new Set<ts.Node>()
): Value {
  if (!node || stack.has(node) || stack.size > 45) return undefined
  const selectorValues = locals.get('__selectorValues')
  if (object(selectorValues) && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))) {
    const key = `${source.file}:${node.getText(source.ast)}`
    if (key in selectorValues) return selectorValues[key]
  }
  const next = new Set(stack).add(node)
  const ev = (child: ts.Node | undefined) => evaluate(child, source, locals, next)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isPrefixUnaryExpression(node)) {
    const value = ev(node.operand)
    if (value === undefined) return undefined
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !value
    if (node.operator === ts.SyntaxKind.MinusToken && typeof value === 'number') return -value
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text
    for (const span of node.templateSpans) {
      const part = ev(span.expression)
      if (part === undefined || typeof part === 'object') return undefined
      value += String(part) + span.literal.text
    }
    return value
  }
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
    if (imported?.file.endsWith('.vue')) return { __componentFile: imported.file }
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
    const controls = locals.get('__columnControls')
    const controlBinding = columnControlBinding(node.expression)
    if (!locals.get('__condition') && controlBinding && object(controls)) {
      const binding = controls[controlBinding]
      if (object(binding) && node.name.text in binding) return binding[node.name.text]
    }
    const value = ev(node.expression)
    if (node.name.text === 'value') return object(value) && 'value' in value ? value.value : value
    if (node.name.text === 'length' && (Array.isArray(value) || typeof value === 'string'))
      return value.length
    return object(value) ? value[node.name.text] : undefined
  }
  if (ts.isElementAccessExpression(node)) {
    const value = ev(node.expression)
    const key = ev(node.argumentExpression)
    if (Array.isArray(value) && typeof key === 'number') return value[key]
    if (!object(value)) return undefined
    // A keyed factory renders several list variants on the same menu. Keep their complete sets.
    const variants = Object.entries(value).filter(([, columns]) => Array.isArray(columns))
    if (variants.length && variants.length === Object.keys(value).length)
      return variants.flatMap(([group, columns]) =>
        (columns as Value[]).map((column) =>
          object(column) ? { ...column, groups: [group] } : column
        )
      )
    if (typeof key === 'string' || typeof key === 'number') return value[String(key)]
    return undefined
  }
  if (ts.isConditionalExpression(node)) {
    const condition = evaluate(
      node.condition,
      source,
      new Map([...locals, ['__condition', true]]),
      next
    )
    if (condition !== undefined) return ev(condition ? node.whenTrue : node.whenFalse)
    const yes = ev(node.whenTrue),
      no = ev(node.whenFalse)
    if (Array.isArray(yes) || Array.isArray(no)) {
      recordSelector(node.condition, source, locals)
      if (permissionCondition(node.condition, source))
        return [...(Array.isArray(yes) ? yes : []), ...(Array.isArray(no) ? no : [])].map(
          (column) => (object(column) ? { ...column, optional: true } : column)
        )
    }
    return Array.isArray(yes) || Array.isArray(no)
      ? [...(Array.isArray(yes) ? yes : []), ...(Array.isArray(no) ? no : [])]
      : (yes ?? no)
  }
  if (ts.isBinaryExpression(node)) {
    const left = ev(node.left)
    const right = ev(node.right)
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.QuestionQuestionToken:
        return left ?? right
      case ts.SyntaxKind.BarBarToken:
        return left === undefined ? (right === true ? true : undefined) : left || right
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return left === undefined ? (right === false ? false : undefined) : left && right
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
        return left === undefined || right === undefined ? undefined : left === right
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return left === undefined || right === undefined ? undefined : left !== right
      case ts.SyntaxKind.PlusToken:
        return typeof left === 'number' && typeof right === 'number'
          ? left + right
          : (typeof left === 'string' || typeof right === 'string') &&
              left !== undefined &&
              right !== undefined
            ? String(left) + String(right)
            : undefined
      default:
        return undefined
    }
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
    return ev(node.body)
  if (ts.isBlock(node)) {
    const env = new Map(locals)
    const values: Value[] = []
    const visit = (statement: ts.Statement): boolean => {
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name))
            env.set(declaration.name.text, evaluate(declaration.initializer, source, env, next))
      if (ts.isReturnStatement(statement)) {
        values.push(evaluate(statement.expression, source, env, next))
        return true
      }
      if (ts.isBlock(statement)) return statement.statements.some(visit)
      if (ts.isExpressionStatement(statement)) evaluate(statement.expression, source, env, next)
      if (ts.isIfStatement(statement)) {
        const condition = evaluate(
          statement.expression,
          source,
          new Map([...env, ['__condition', true]]),
          next
        )
        if (condition === true) return visit(statement.thenStatement)
        if (condition === false)
          return statement.elseStatement ? visit(statement.elseStatement) : false
        recordSelector(statement.expression, source, env)
        const previousOptional = env.get('__optionalColumns')
        if (permissionCondition(statement.expression, source)) env.set('__optionalColumns', true)
        const yes = visit(statement.thenStatement)
        const no = statement.elseStatement ? visit(statement.elseStatement) : false
        env.set('__optionalColumns', previousOptional)
        return yes && no
      }
      if (ts.isForOfStatement(statement) && ts.isVariableDeclarationList(statement.initializer)) {
        const items = evaluate(statement.expression, source, env, next)
        const binding = statement.initializer.declarations[0].name
        if (Array.isArray(items) && ts.isIdentifier(binding))
          for (const item of items) {
            env.set(binding.text, item)
            if (visit(statement.statement)) return true
          }
      }
      return false
    }
    node.statements.some(visit)
    const arrays = values.filter(Array.isArray)
    if (arrays.length > 1)
      return arrays.flatMap((columns, index) =>
        columns.map((column) =>
          object(column)
            ? {
                ...column,
                groups: Array.isArray(column.groups) ? column.groups : [`variant-${index + 1}`]
              }
            : column
        )
      )
    return arrays[0] ?? values[0]
  }
  if (ts.isCallExpression(node)) {
    if (ts.isElementAccessExpression(node.expression)) return ev(node.expression)
    const name = node.expression.getText(source.ast)
    if (name === 'Array.from') {
      const input = ev(node.arguments[0])
      const callback = node.arguments[1]
      if (
        object(input) &&
        typeof input.length === 'number' &&
        input.length <= 366 &&
        callback &&
        ts.isArrowFunction(callback)
      )
        return Array.from({ length: input.length }, (_, index) => {
          const env = new Map(locals)
          callback.parameters.forEach((parameter, i) => {
            bindValue(parameter.name, i === 1 ? index : undefined, env)
          })
          return evaluate(callback.body, source, env, next)
        })
      return undefined
    }
    // Permission-dependent columns belong in the catalog; runtime factories still enforce access.
    if (/(?:^|\.)(?:canViewField|hasAuth|hasPermission)$/.test(name)) return undefined
    if (name === 'useRoute') return locals.get('__route')
    if (name === 'defineProps') return locals.get('__props')
    if (name === 'withDefaults') {
      const defaults = ev(node.arguments[1]),
        props = ev(node.arguments[0])
      return { ...(object(defaults) ? defaults : {}), ...(object(props) ? props : {}) }
    }
    if (name === 'String') {
      const value = ev(node.arguments[0])
      return value === undefined ? undefined : String(value)
    }
    if (
      ['computed', 'ref', 'shallowRef', 'reactive', 'readonly', 'unref', 'toValue'].includes(name)
    ) {
      if (locals.get('__condition') && ['ref', 'shallowRef', 'reactive'].includes(name))
        return undefined
      const value = ev(node.arguments[0])
      // Writable computed models carry runtime selections, not fixed metadata objects.
      if (name === 'computed' && object(value) && ts.isObjectLiteralExpression(node.arguments[0]))
        return undefined
      // Mutable tab selections must not exclude the other lists reachable on this menu.
      return ['ref', 'shallowRef'].includes(name) && !object(value) && !Array.isArray(value)
        ? undefined
        : value
    }
    if (name === 'h' || name.startsWith('$t') || name.endsWith('.t')) return ev(node.arguments[0])
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      [
        'filter',
        'map',
        'flatMap',
        'find',
        'push',
        'concat',
        'split',
        'at',
        'endsWith',
        'includes',
        'splice',
        'slice',
        'padStart',
        'join'
      ].includes(node.expression.name.text)
    ) {
      const items = ev(node.expression.expression)
      const method = node.expression.name.text
      const args = node.arguments.flatMap((arg) => {
        const value = ev(ts.isSpreadElement(arg) ? arg.expression : arg)
        return ts.isSpreadElement(arg) && Array.isArray(value) ? value : [value]
      })
      if (typeof items === 'string') {
        if (method === 'split' && typeof args[0] === 'string') return items.split(args[0])
        if (method === 'endsWith' && typeof args[0] === 'string') return items.endsWith(args[0])
        if (method === 'includes' && typeof args[0] === 'string') return items.includes(args[0])
        if (method === 'padStart' && typeof args[0] === 'number' && typeof args[1] === 'string')
          return items.padStart(args[0], args[1])
      }
      if (!Array.isArray(items)) return undefined
      if (method === 'push') {
        items.push(
          ...args.map((column) =>
            locals.get('__optionalColumns') && object(column)
              ? { ...column, optional: true }
              : column
          )
        )
        return items.length
      }
      if (method === 'splice' && typeof args[0] === 'number' && typeof args[1] === 'number')
        return items.splice(args[0], args[1], ...args.slice(2))
      if (method === 'slice')
        return items.slice(
          typeof args[0] === 'number' ? args[0] : undefined,
          typeof args[1] === 'number' ? args[1] : undefined
        )
      if (method === 'join' && (typeof args[0] === 'string' || args[0] === undefined))
        return items.join(args[0])
      if (method === 'concat') return items.concat(...args)
      if (method === 'at' && typeof args[0] === 'number') return items.at(args[0])
      if (method === 'includes') return items.includes(args[0])
      const callback = node.arguments[0]
      if (method === 'filter' && ts.isIdentifier(callback) && callback.text === 'Boolean')
        return items.filter(Boolean)
      if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)))
        return items
      const mapped = items.map((item, index) => {
        const env = new Map(locals)
        callback.parameters.forEach((parameter, i) => {
          bindValue(parameter.name, i === 0 ? item : index, env)
        })
        const value = evaluate(callback.body, source, env, next)
        // A known metadata field omitted from an object is false in filter predicates.
        return method === 'filter' &&
          value === undefined &&
          ts.isPropertyAccessExpression(callback.body) &&
          object(evaluate(callback.body.expression, source, env, next))
          ? false
          : value
      })
      if (method === 'filter') return items.filter((_, index) => mapped[index] !== false)
      if (method === 'find') return items.find((_, index) => mapped[index] === true)
      return method === 'flatMap' ? mapped.flat() : mapped
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
          bindValue(
            parameter.name,
            ev(node.arguments[i]) ?? evaluate(parameter.initializer, target, env, next),
            env
          )
        })
        return evaluate(fn.body, target, env, next)
      }
    }
    // Object-owned column factories are statically evaluated metadata, not executable callbacks.
    if (ts.isPropertyAccessExpression(node.expression) && node.arguments.length === 0)
      return ev(node.expression)
  }
  return undefined
}

function settings(
  value: Value,
  parentKey?: string,
  inheritedGroups?: string[]
): TableColumnSetting[] {
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
    const groups = Array.isArray(column.groups)
      ? column.groups.filter((group): group is string => typeof group === 'string')
      : inheritedGroups
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
        ...(groups ? { groups } : {}),
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
        ...(column.optional === true ? { optional: true } : {}),
        locked: Boolean(
          column.type || isTableOperationColumn({ prop: column.prop, label }) || column.disabled
        )
      },
      ...settings(column.children, key, groups)
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

function columnSettings(
  node: ts.Node | undefined,
  source: Source,
  locals: Map<string, Value>
): TableColumnSetting[] {
  const selectors: { [key: string]: Value } = {}
  const initial = settings(
    evaluate(node, source, new Map([...locals, ['__selectorsFound', selectors]]))
  )
  if (!Object.keys(selectors).length) return initial
  let variants: Array<{ values: { [key: string]: Value }; label: string }> = [
    { values: {}, label: '' }
  ]
  for (const [key, values] of Object.entries(selectors)) {
    if (!Array.isArray(values)) continue
    variants = variants.flatMap((variant) =>
      values.map((value) => ({
        values: { ...variant.values, [key]: value },
        label: [variant.label, `${key.slice(key.lastIndexOf(':') + 1)}=${value}`]
          .filter(Boolean)
          .join(', ')
      }))
    )
  }
  const columns = new Map<string, TableColumnSetting>()
  for (const variant of variants)
    for (const column of settings(
      evaluate(node, source, new Map([...locals, ['__selectorValues', variant.values]]))
    )) {
      const groups = column.groups?.map((group) => `${variant.label}/${group}`) ?? [variant.label]
      const existing = columns.get(column.key)
      if (existing) existing.groups = uniq([...(existing.groups ?? []), ...groups])
      else columns.set(column.key, { ...column, groups })
    }
  return [...columns.values()]
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

function templateColumns(
  source: Source,
  template: string,
  locals: Map<string, Value>
): TableColumnSetting[] {
  const values: Value[] = []
  for (const match of template.matchAll(/<ElTableColumn\b([^>]*?)(?:\/?>)/g)) {
    const column: { [key: string]: Value } = {}
    for (const attr of match[1].matchAll(
      /(?:^|\s)(:?)(prop|label|type|width|min-width|fixed|sortable|align)(?:="([^"]*)")?/g
    )) {
      const key = attr[2] === 'min-width' ? 'minWidth' : attr[2]
      column[key] =
        attr[1] && attr[3] ? evaluate(expression(attr[3]), source, locals) : (attr[3] ?? true)
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
  locals: Map<string, Value>,
  seen = new Set<string>()
): { source: Source; columns: TableColumnSetting[]; searchKeys: string[] } | undefined {
  if (seen.has(file)) return undefined
  seen = new Set(seen).add(file)
  const source = load(file)
  // Enumerate all values of multi-select column controls, rather than only their initial selection.
  const search = evaluate(source.symbols.get('search'), source, locals)
  const searchItems = evaluate(source.symbols.get('searchItems'), source, locals)
  if (object(search) && Array.isArray(searchItems)) {
    const completeSearch: { [key: string]: Value } = {}
    for (const item of searchItems.filter(object)) {
      const key = item.key ?? item.prop
      const options = object(item.props) ? item.props.options : undefined
      if (typeof key === 'string' && Array.isArray(search[key]) && Array.isArray(options))
        completeSearch[key] = options.filter(object).map((option) => option.value)
    }
    locals = new Map([...locals, ['__columnControls', { search: completeSearch }]])
  }
  const tables: Array<{
    source: Source
    columns: TableColumnSetting[]
    searchKeys: string[]
    group: string
  }> = []
  type TemplateNode = NonNullable<Source['templateAst']>['children'][number]
  const visit = (nodes: TemplateNode[]): void => {
    let branchTaken: boolean | undefined = false
    for (const node of nodes) {
      if (!('tag' in node)) continue
      const condition = node.props.find(
        (prop) => prop.type === 7 && ['if', 'else-if', 'else'].includes(prop.name)
      )
      if (condition?.type === 7) {
        if (condition.name === 'if') branchTaken = false
        if (branchTaken === true) continue
        const value =
          condition.exp && 'content' in condition.exp
            ? evaluate(
                expression(condition.exp.content),
                source,
                new Map([...locals, ['__condition', true]])
              )
            : true
        if (value === false) continue
        branchTaken = value === undefined ? undefined : true
      } else branchTaken = false
      if (/Dialog|Drawer|Picker/.test(node.tag)) continue
      if (node.tag === 'ArtTable' || node.tag === 'ArtTableQuery') {
        const binding = node.loc.source.match(
          /<ArtTable(?:Query)?\b[^>]*?:(?:columns-factory|table-columns|columns)="([^"]+)"/
        )
        let columns = binding ? columnSettings(expression(binding[1]), source, locals) : []
        if (!columns.length)
          columns = columnSettings(
            source.symbols.get('columnsFactory') ??
              source.symbols.get('tableColumns') ??
              source.symbols.get('columns'),
            source,
            locals
          )
        if (!columns.length) {
          // Legacy useTable declares the factory inside its options rather than as a symbol.
          const candidates: TableColumnSetting[][] = []
          const visit = (node: ts.Node) => {
            if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'columnsFactory')
              candidates.push(columnSettings(node.initializer, source, locals))
            ts.forEachChild(node, visit)
          }
          visit(source.ast)
          columns = candidates.sort((a, b) => b.length - a.length)[0] ?? []
        }
        if (!columns.length) columns = templateColumns(source, node.loc.source, locals)
        if (columns.length) {
          const search = evaluate(source.symbols.get('searchItems'), source, locals)
          tables.push({
            source,
            columns,
            group: binding?.[1] ?? `table-${tables.length + 1}`,
            searchKeys: Array.isArray(search)
              ? search
                  .filter(object)
                  .flatMap((item) => (typeof item.prop === 'string' ? [item.prop] : []))
              : []
          })
        }
        continue
      }
      // Follow only rendered workspaces, preserving route and wrapper props.
      const dynamic = node.props.find(
        (prop) =>
          prop.type === 7 &&
          prop.name === 'bind' &&
          prop.arg?.type === 4 &&
          prop.arg.content === 'is'
      )
      const selected =
        dynamic?.type === 7 && dynamic.exp && 'content' in dynamic.exp
          ? evaluate(expression(dynamic.exp.content), source, locals)
          : undefined
      const importedFile =
        node.tag === 'component' && object(selected) && typeof selected.__componentFile === 'string'
          ? selected.__componentFile
          : source.imports.get(node.tag)?.file
      if (
        importedFile?.endsWith('.vue') &&
        !/Select|Header|Filter|Panel|Toolbar|Actions|Guard|Detail(?:Content)?$/.test(node.tag)
      ) {
        const props: { [key: string]: Value } = {}
        for (const prop of node.props) {
          if (prop.type === 6)
            props[prop.name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
              prop.value?.content ?? true
          if (
            prop.type === 7 &&
            prop.name === 'bind' &&
            prop.arg?.type === 4 &&
            prop.exp &&
            'content' in prop.exp
          )
            props[
              prop.arg.content.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
            ] = evaluate(expression(prop.exp.content), source, locals)
        }
        const found = locateTable(importedFile, new Map([...locals, ['__props', props]]), seen)
        if (found) tables.push({ ...found, group: node.tag })
      }
      visit(node.children)
    }
    return undefined
  }
  if (source.templateAst) visit(source.templateAst.children)
  if (!tables.length) return undefined
  if (tables.length === 1) return tables[0]
  const columns = new Map<string, TableColumnSetting>()
  for (const table of tables)
    for (const column of table.columns) {
      const groups = column.groups ?? [table.group]
      const existing = columns.get(column.key)
      if (existing) existing.groups = uniq([...(existing.groups ?? []), ...groups])
      else columns.set(column.key, { ...column, groups })
    }
  return {
    source: tables[0].source,
    columns: [...columns.values()],
    searchKeys: uniq(tables.flatMap((table) => table.searchKeys))
  }
}

export function generateColumnCatalog(menus: MenuRow[]): {
  catalogs: TableColumnCatalog[]
  unregistered: Array<{ menuId: string; routePath: string; reason: string }>
} {
  const catalogs: TableColumnCatalog[] = [],
    unregistered: Array<{ menuId: string; routePath: string; reason: string }> = []
  for (const menu of menus
    .filter((item) => item.type === 'menu' && item.component?.startsWith('/'))
    .sort((a, b) => a.id.localeCompare(b.id))) {
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
    const found = entry
      ? locateTable(entry, new Map([['__route', { path: component }]]))
      : undefined
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
  const jsonFormat = {
    ...(await resolveConfig(path.join(root, '.prettierrc'))),
    parser: 'json' as const
  }
  fs.mkdirSync('src/config', { recursive: true })
  fs.writeFileSync(
    'src/config/table-column-catalog.generated.json',
    await format(JSON.stringify(result.catalogs), jsonFormat)
  )
  fs.writeFileSync(
    'src/config/table-column-routes.generated.json',
    await format(
      JSON.stringify(result.catalogs.map((catalog) => catalog.routePath).sort()),
      jsonFormat
    )
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
