import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const resourceKeys = new Set([
  'vehicleId',
  'driverId',
  'primaryDriverId',
  'backupDriverIds',
  'dispatchVehicleId',
  'dispatchDriverId'
])
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sources(path.join(directory, entry.name))
        : /\.(vue|tsx?)$/.test(entry.name)
          ? [path.join(directory, entry.name)]
          : []
    )
  )
  return groups.flat()
}

test('all vehicle and driver reference fields use the shared table selector instead of dropdowns', async () => {
  const roots = [
    'src/views',
    'src/components/business',
    ...(await readdir('modules'))
      .filter((name) => name !== 'art-supabase-doc')
      .map((name) => path.join('modules', name, 'src'))
  ]
  const files = (await Promise.all(roots.map((root) => sources(root)))).flat()
  const violations: string[] = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const script = file.endsWith('.vue')
      ? (text.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '')
      : text
    const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = new Map(
          node.properties
            .filter(ts.isPropertyAssignment)
            .map((property) => [
              property.name.getText(ast).replaceAll("'", '').replaceAll('"', ''),
              property.initializer
            ])
        )
        const key = properties.get('key')
        const type = properties.get('type')
        if (
          key &&
          type &&
          ts.isStringLiteralLike(key) &&
          resourceKeys.has(key.text) &&
          ts.isStringLiteralLike(type) &&
          ['select', 'selectV2', 'autocomplete'].includes(type.text)
        )
          violations.push(file + ': ' + key.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  assert.deepEqual(violations, [], 'Record selection must use the shared searchable table dialog')
})
