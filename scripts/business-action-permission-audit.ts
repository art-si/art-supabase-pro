import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

export interface ActionPermissionIssue {
  key: string
  label: string
  kind: 'more-missing-auth' | 'header-auth-property'
}

/** Inspect statically owned action lists; imported/dynamic factories retain their own contracts. */
export function findActionPermissionIssues(
  source: string,
  fileName: string,
  checkMoreItems: boolean
): ActionPermissionIssue[] {
  if (!source.includes('ArtButtonMore') && !source.includes('headerActions')) return []
  const descriptor = fileName.endsWith('.vue') ? parse(source).descriptor : undefined
  const script = descriptor
    ? [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
    : source
  const ast = ts.createSourceFile(fileName, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const moreNames = new Set<string>()
  const moreTargets: ts.Node[] = []
  const headerTargets: ts.Node[] = []
  const issues: ActionPermissionIssue[] = []
  const properties = (node: ts.ObjectLiteralExpression): Map<string, ts.Expression> =>
    new Map(
      node.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => [
          property.name.getText(ast).replace(/^['"]|['"]$/g, ''),
          property.initializer
        ])
    )
  const addMoreExpression = (expression: ts.Expression): void => {
    if (ts.isArrayLiteralExpression(expression)) moreTargets.push(expression)
    else {
      const name = expression.getText(ast).match(/^([A-Za-z_$][\w$]*)/)?.[1]
      if (name) moreNames.add(name)
    }
  }
  for (const tag of descriptor?.template?.content.matchAll(/<ArtButtonMore\b[\s\S]*?>/g) ?? []) {
    const name = tag[0].match(/:list="([A-Za-z_$][\w$]*)/)?.[1]
    if (name) moreNames.add(name)
  }
  const visitBindings = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(ast) === 'ArtButtonMore'
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(ast) === 'list' &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        )
          addMoreExpression(attribute.initializer.expression)
      }
    }
    const options =
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'h' &&
      node.arguments[0]?.getText(ast) === 'ArtButtonMore'
        ? node.arguments[1]
        : undefined
    if (options && ts.isObjectLiteralExpression(options)) {
      const list = properties(options).get('list')
      if (list) addMoreExpression(list)
    }
    ts.forEachChild(node, visitBindings)
  }
  visitBindings(ast)
  const visitDeclarations = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      if (moreNames.has(node.name.getText(ast))) moreTargets.push(node)
      if (node.name.getText(ast) === 'headerActions') headerTargets.push(node)
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'headerActions')
      headerTargets.push(node.initializer)
    ts.forEachChild(node, visitDeclarations)
  }
  visitDeclarations(ast)
  const inspect = (target: ts.Node, kind: 'more' | 'header'): void => {
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const props = properties(node)
        const key = props.get('key') ?? props.get('type')
        const label = props.get('label')
        if (key && ts.isStringLiteral(key) && label && ts.isStringLiteral(label)) {
          if (kind === 'more' && !props.has('type') && !props.has('auth'))
            issues.push({ key: key.text, label: label.text, kind: 'more-missing-auth' })
          if (kind === 'header' && props.has('auth') && !props.has('permission'))
            issues.push({ key: key.text, label: label.text, kind: 'header-auth-property' })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(target)
  }
  if (checkMoreItems) moreTargets.forEach((node) => inspect(node, 'more'))
  headerTargets.forEach((node) => inspect(node, 'header'))
  return issues
}
