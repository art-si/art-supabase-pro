import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildDataDump, readCopyInventory } from '../../scripts/lib/backup-update-data'

const header = "SET client_encoding = 'UTF8';\nSELECT pg_catalog.set_config('search_path', '', false);\n"
const copy = (rows: string[]) =>
  `COPY "public"."weird.name" ("value", "flag") FROM stdin;\n${rows.join('\n')}${rows.length ? '\n' : ''}\\.\n`

test('COPY inventory fingerprints changes, deletions, duplicates, and ignores row order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-update-data-'))
  try {
    const variants = [
      ['hello\\tworld\tt', 'line\\nfeed\tf'],
      ['line\\nfeed\tf', 'hello\\tworld\tt'],
      ['hello\\tworld\tt', 'line\\nfeed\tt'],
      ['hello\\tworld\tt'],
      ['hello\\tworld\tt', 'hello\\tworld\tt']
    ]
    const inventories = []
    for (let index = 0; index < variants.length; index++) {
      const path = join(root, `${index}.sql`)
      await writeFile(path, `${header}${copy(variants[index])}\nSELECT pg_catalog.setval('public.seq'::regclass, 42, true);\n-- PostgreSQL database dump complete\n`)
      inventories.push(await readCopyInventory(path))
    }
    const [original, reordered, edited, deleted, duplicated] = inventories.map(item => item.tables[0].fingerprint)
    assert.deepEqual(original, reordered)
    assert.notDeepEqual(original, edited)
    assert.notDeepEqual(original, deleted)
    assert.notDeepEqual(original, duplicated)
    assert.equal(original.rows, '2')
    assert.equal(duplicated.rows, '2')
    assert.equal(inventories[0].tables[0].key, JSON.stringify(['public', 'weird.name']))
    assert.equal(inventories[0].sequenceStatements.length, 1)
    const digest = createHash('sha256').update(Buffer.from('hello\\tworld\tt')).digest()
    assert.ok(BigInt(original.sums[0]) >= BigInt(digest.readUInt32BE(0)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('COPY ranges reassemble byte-exact blocks with an explicit completion footer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-update-merge-'))
  try {
    const source = join(root, 'source.sql')
    const second = join(root, 'second.sql')
    await writeFile(source, `${header}${copy(['one\tt'])}\nSELECT pg_catalog.setval('public.seq'::regclass, 1, true);\n`)
    await writeFile(second, `${header}${copy(['two\tf'])}`)
    const firstInventory = await readCopyInventory(source)
    const secondInventory = await readCopyInventory(second)
    const destination = join(root, 'merged.sql')
    await buildDataDump(destination, [
      { file: source, start: firstInventory.tables[0].start, end: firstInventory.tables[0].end },
      { file: second, start: secondInventory.tables[0].start, end: secondInventory.tables[0].end }
    ], firstInventory.sequenceStatements)
    const merged = await readFile(destination, 'utf8')
    assert.match(merged, /one\tt/)
    assert.match(merged, /two\tf/)
    assert.match(merged, /-- PostgreSQL database dump complete\n$/)
    await assert.rejects(readCopyInventory(destination), /Duplicate COPY section/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('COPY parser refuses unsupported statements and unfinished blocks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-update-unsafe-'))
  try {
    const unsupported = join(root, 'unsupported.sql')
    await writeFile(unsupported, `${header}${copy(['one\tt'])}\nINSERT INTO public.extra VALUES (1);\n`)
    await assert.rejects(readCopyInventory(unsupported), /Unsupported non-COPY/)
    const unfinished = join(root, 'unfinished.sql')
    await writeFile(unfinished, `${header}COPY "public"."items" ("id") FROM stdin;\n1\n`)
    await assert.rejects(readCopyInventory(unfinished), /without \\\./)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
