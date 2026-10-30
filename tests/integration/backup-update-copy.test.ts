import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import postgres from 'postgres'
import { fingerprintSourceTable, readCopyInventory, listSourceTables } from '../../scripts/lib/backup-update-data'

const image = 'public.ecr.aws/supabase/postgres:17.6.1.062'

function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 })
  if (result.error || result.status !== 0) {
    throw new Error(`Disposable PostgreSQL command failed: ${result.error?.message ?? result.stderr}`)
  }
  return result.stdout
}

test('COPY fingerprint matches real pg_dump text for PostgreSQL output types', { timeout: 180_000 }, async () => {
  const container = `codex-copy-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const root = await mkdtemp(join(tmpdir(), 'backup-copy-pg17-'))
  let started = false
  let sourceSql:ReturnType<typeof postgres>|undefined
  try {
    docker(['run', '--rm', '--pull', 'never', '-d', '-p', '127.0.0.1::5432', '--name', container,
      '-e', 'POSTGRES_PASSWORD=fixture', image])
    started = true
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      const status = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { encoding: 'utf8' })
      if (status.status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(ready, 'isolated PostgreSQL did not become ready')
    const psql = (query: string) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-F', '\t'], `${query}\n`).trim()
    psql(`
      CREATE TYPE public.copy_mood AS ENUM ('go', 'stop');
      CREATE TYPE public.copy_pair AS (x integer, y text);
      CREATE TABLE public.copy_fixture (
        id integer, flag boolean, txt text, data bytea, ts timestamptz,
        nums integer[], mood public.copy_mood, pair public.copy_pair,
        amount numeric, gap interval
      );
      INSERT INTO public.copy_fixture VALUES
        (1, true, 'tab' || chr(9) || 'line' || chr(10) || chr(92),
          decode('00ff5c', 'hex'), '2026-10-30 12:34:56+08',
          ARRAY[1,NULL,3], 'go', ROW(1,'a,b')::public.copy_pair, 123.450, '1 day 02:03:04'),
        (2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        (3, false, chr(8)||chr(12)||chr(11)||chr(13),
          decode('', 'hex'), '2026-10-30 00:00:00+00',
          ARRAY[]::integer[], 'stop', ROW(NULL,'x')::public.copy_pair, -0.01, '-1 hour');
    `)
    const port=Number(docker(['port',container,'5432/tcp']).trim().split(':').at(-1))
    sourceSql=postgres({host:'127.0.0.1',port,username:'postgres',password:'fixture',database:'postgres',ssl:false,max:1,prepare:false,onnotice:()=>{}})
    await sourceSql.unsafe("SET TIME ZONE 'UTC'; SET DateStyle='ISO, MDY'; SET IntervalStyle='postgres'; SET bytea_output='hex'; SET extra_float_digits=3")
    const table=(await listSourceTables(sourceSql,['public'])).find(table=>table.name==='copy_fixture')
    assert.ok(table)
    const remoteFingerprint = await fingerprintSourceTable(sourceSql, table)
    const dump = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
      '--data-only', '--quote-all-identifiers', '--table=public.copy_fixture'])
    const dumpPath = join(root, 'fixture.sql')
    await writeFile(dumpPath, dump)
    const inventory = await readCopyInventory(dumpPath)
    assert.equal(inventory.tables.length, 1)
    assert.deepEqual(inventory.tables[0].columns, table.columns)
    assert.deepEqual(inventory.tables[0].fingerprint, remoteFingerprint)

    psql("UPDATE public.copy_fixture SET txt = 'changed' WHERE id = 1")
    assert.notDeepEqual(await fingerprintSourceTable(sourceSql, table), remoteFingerprint)
    psql('DELETE FROM public.copy_fixture WHERE id = 2')
    assert.equal((await fingerprintSourceTable(sourceSql, table)).rows, '2')
  } finally {
    await sourceSql?.end({timeout:1})
    if (started) spawnSync('docker', ['stop', container], { encoding: 'utf8', timeout: 30_000 })
    await rm(root, { recursive: true, force: true })
  }
})
