import assert from 'node:assert/strict'
import test from 'node:test'
import postgres from 'postgres'
import { spawnSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runBackupUpdate } from '../../scripts/backup-update'
import { readCopyInventory } from '../../scripts/lib/backup-update-data'
import {
  fileHash,
  makeSnapshotManifest,
  runUpdateCommand,
  type UpdateCommand
} from '../../scripts/lib/backup-update-io'
const image = 'public.ecr.aws/supabase/postgres:17.6.1.062'
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024
  })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  return result.stdout
}
test(
  'existing complete snapshot updates only changed table exports and skips a subsequent unchanged run',
  { skip: process.platform !== 'win32', timeout: 240_000 },
  async () => {
    const container = `codex-update-flow-${randomUUID().slice(0, 12)}`
    const parent = await mkdtemp(path.join(tmpdir(), 'backup-update-flow-'))
    let root = path.join(parent, '完整快照')
    const cacheRoots = new Set([root])
    let admin: ReturnType<typeof postgres> | undefined,
      started = false
    const workspaces = new Set<string>()
    try {
      const hba = path.join(parent, 'fixture-hba.conf')
      await writeFile(
        hba,
        'local all all trust\nhost all all 0.0.0.0/0 trust\nhost all all ::/0 trust\n'
      )
      docker([
        'run',
        '--rm',
        '--pull',
        'never',
        '-d',
        '-p',
        '127.0.0.1::5432',
        '--name',
        container,
        '-e',
        'POSTGRES_PASSWORD=fixture',
        '-v',
        `${hba}:/fixture-hba.conf:ro`,
        image,
        'postgres',
        '-c',
        'hba_file=/fixture-hba.conf',
        '-c',
        'listen_addresses=*'
      ])
      started = true
      let ready = false
      for (let i = 0; i < 90; i++) {
        if (
          spawnSync('docker', [
            'exec',
            container,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres'
          ]).status === 0
        ) {
          ready = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      assert.ok(ready)
      const port = Number(docker(['port', container, '5432/tcp']).trim().split(':').at(-1))
      const connect = () =>
        postgres({
          host: '127.0.0.1',
          port,
          username: 'postgres',
          database: 'postgres',
          password: 'fixture',
          max: 2,
          ssl: false,
          prepare: false,
          fetch_types: false,
          connect_timeout: 5,
          onnotice: () => {}
        })
      admin = connect()
      docker(
        [
          'exec',
          '-i',
          container,
          'psql',
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1'
        ],
        'GRANT USAGE, CREATE ON SCHEMA auth, storage TO postgres;'
      )
      await admin.unsafe(`create schema if not exists auth;create schema if not exists storage;create schema if not exists supabase_migrations;
      create table public.items(id integer primary key,flag boolean,value text);
      create table public.retained(id integer,value text);
      create table public.removed_table(id integer);
      insert into public.items values(1,true,'before');insert into public.retained values(1,'unchanged');insert into public.removed_table values(1);
      create table supabase_migrations.schema_migrations(version text primary key,statements text[]);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],created_at timestamptz,updated_at timestamptz);
      create table storage.objects(id uuid,bucket_id text,name text,version text,metadata jsonb,updated_at timestamptz);`)
      await mkdir(path.join(root, 'database'), { recursive: true })
      await mkdir(path.join(root, 'metadata'))
      const pgDump = (extra: string[]) =>
        docker([
          'exec',
          container,
          'pg_dump',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '--quote-all-identifiers',
          ...extra
        ])
      const initialSchema = pgDump(['--schema-only', '--schema=public'])
      await writeFile(
        path.join(root, 'database/roles.sql'),
        'SET statement_timeout = 0;\nRESET ALL;\n'
      )
      await writeFile(path.join(root, 'database/schema.sql'), initialSchema)
      await writeFile(
        path.join(root, 'database/data.sql'),
        pgDump(['--data-only', '--schema=public', '--schema=auth', '--schema=storage'])
      )
      await writeFile(
        path.join(root, 'database/migration-history-schema.sql'),
        pgDump(['--schema-only', '--schema=supabase_migrations'])
      )
      await writeFile(
        path.join(root, 'database/migration-history-data.sql'),
        pgDump(['--data-only', '--schema=supabase_migrations'])
      )
      await writeFile(
        path.join(root, 'database/managed-schema-snapshot.sql'),
        pgDump(['--schema-only', '--schema=auth', '--schema=storage'])
      )
      for (const name of [
        'functions',
        'storage-buckets',
        'storage-object-counts',
        'realtime-publication-tables'
      ])
        await writeFile(path.join(root, 'metadata', name + '.json'), '[]')
      await writeFile(
        path.join(root, 'metadata/database-connection.json'),
        JSON.stringify({
          Host: 'aws-1-ap-south-1.pooler.supabase.com',
          Port: 5432,
          User: 'postgres.ckbftoopuyophiebamwy',
          Database: 'postgres'
        })
      )
      await writeFile(path.join(root, 'config.toml'), 'project_id = "backup-update-fixture"\n')
      const manifest = {
        format_version: 1,
        project_ref: 'ckbftoopuyophiebamwy',
        created_at: new Date().toISOString()
      }
      await makeSnapshotManifest(root, manifest, '0'.repeat(64))
      const calls: Array<{ command: string; args: string[] }> = []
      let failNewTableOnce = true
      const run: UpdateCommand = async (command, args, options) => {
        calls.push({ command, args })
        assert.ok(!args.join(' ').includes('SOURCE_SECRET_DO_NOT_LOG'))
        if (command === 'supabase') {
          if (args[0] === 'functions') return { code: 0, stdout: '[]', stderr: '' }
          if (args[0] === 'db' && args[1] === 'dump') {
            const out = args[args.indexOf('--file') + 1]
            workspaces.add(path.dirname(out))
            let text: string
            if (args.includes('--role-only'))
              text = await readFile(path.join(root, 'database/roles.sql'), 'utf8')
            else if (args.includes('--schema')) {
              const schemas = args[args.indexOf('--schema') + 1].split(',')
              text = pgDump(['--schema-only', ...schemas.map((schema) => '--schema=' + schema)])
            } else text = pgDump(['--schema-only', '--schema=public'])
            await writeFile(out, text)
            return { code: 0, stdout: '', stderr: '' }
          }
          throw new Error('Unexpected fixture CLI command')
        }
        if (command === 'docker') {
          if (args[0] === 'image') return { code: 0, stdout: image + '\n', stderr: '' }
          assert.equal(args[0], 'run')
          const mount = args[args.indexOf('-v') + 1],
            directory = mount.slice(0, -5)
          const output = path.join(directory, path.posix.basename(args[args.indexOf('--file') + 1]))
          workspaces.add(directory)
          if (args[args.indexOf('--table') + 1] === '"public"."new_table"' && failNewTableOnce) {
            failNewTableOnce = false
            return { code: 1, stdout: '', stderr: 'Fixture interrupted download' }
          }
          const isolatedArgs = [...args]
          isolatedArgs.splice(1, 0, '--network', `container:${container}`)
          isolatedArgs[isolatedArgs.indexOf('--host') + 1] = '127.0.0.1'
          isolatedArgs[isolatedArgs.indexOf('--port') + 1] = '5432'
          isolatedArgs[isolatedArgs.indexOf('--username') + 1] = 'postgres'
          const result = await runUpdateCommand(command, isolatedArgs, {
            ...options,
            timeoutMs: 30_000
          })
          if (result.code !== 0) throw new Error(`隔离 Docker 导出失败：${result.stderr}`)
          assert.ok(
            (await readFile(output, 'utf8')).includes('COPY '),
            'real native Docker dump must create data'
          )
          return result
        }
        return runUpdateCommand(command, args, options)
      }
      const input = (apply: boolean, planId?: string) => ({
        UpdateBackupPath: root,
        DbPassword: 'SOURCE_SECRET_DO_NOT_LOG',
        PlanOnly: !apply,
        ApplyUpdate: apply,
        ...(planId ? { PlanId: planId } : {})
      })
      const first = await runBackupUpdate(input(true), run, () => connect())
      assert.equal(first.status, 'updated', JSON.stringify(first))
      root = first.backupPath
      cacheRoots.add(root)
      assert.equal(
        calls.filter((call) => call.command === 'docker' && call.args[0] === 'run').length,
        0,
        'initial matching COPY tables must not re-download'
      )
      const unchangedHash = await fileHash(path.join(root, 'manifest.json'))
      calls.length = 0
      const noChange = await runBackupUpdate(input(true), run, () => connect())
      assert.equal(noChange.status, 'unchanged', JSON.stringify(noChange))
      root = noChange.backupPath
      cacheRoots.add(root)
      assert.equal(await fileHash(path.join(root, 'manifest.json')), unchangedHash)
      assert.equal(
        calls.filter((call) => call.command === 'supabase' && call.args[0] === 'db').length,
        0
      )
      assert.equal(calls.filter((call) => call.command === 'docker').length, 0)
      const oldRetained = (
        await readCopyInventory(path.join(root, 'database/data.sql'))
      ).tables.find((table) => table.name === 'retained')!
      await admin.unsafe(`update public.items set value='after' where id=1;create table public.new_table(id integer);insert into public.new_table values(7);
      drop table public.removed_table;alter table public.items enable row level security;create policy items_read on public.items for select using(flag);`)
      const preview = await runBackupUpdate(input(false), run, () => connect())
      assert.equal(preview.status, 'planned', JSON.stringify(preview))
      assert.equal(
        await fileHash(path.join(root, 'manifest.json')),
        unchangedHash,
        'preview must not change the backup'
      )
      calls.length = 0
      const failed = await runBackupUpdate(input(true, preview.planId), run, () => connect())
      assert.equal(failed.status, 'failed')
      assert.equal(
        await fileHash(path.join(root, 'manifest.json')),
        unchangedHash,
        'failed download keeps the complete baseline'
      )
      const tableDownloads = calls.filter(
        (call) => call.command === 'docker' && call.args[0] === 'run'
      )
      assert.equal(tableDownloads.length, 2)
      assert.deepEqual(
        tableDownloads.map((call) => call.args[call.args.indexOf('--table') + 1]).sort(),
        ['"public"."items"', '"public"."new_table"']
      )
      calls.length = 0
      const changed = await runBackupUpdate(input(true, failed.planId), run, () => connect())
      assert.equal(changed.status, 'updated', JSON.stringify(changed))
      root = changed.backupPath
      cacheRoots.add(root)
      const retried = calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')
      assert.deepEqual(
        retried.map((call) => call.args[call.args.indexOf('--table') + 1]),
        ['"public"."new_table"'],
        'retry reuses the validated changed-table cache'
      )
      const updated = await readCopyInventory(path.join(root, 'database/data.sql'))
      assert.deepEqual(
        updated.tables.find((table) => table.name === 'retained')!.fingerprint,
        oldRetained.fingerprint
      )
      assert.ok(!updated.tables.some((table) => table.name === 'removed_table'))
      assert.match(
        await readFile(path.join(root, 'database/schema.sql'), 'utf8'),
        /CREATE POLICY "items_read"/
      )
      assert.ok(changed.historyPath)
      assert.equal(await fileHash(path.join(changed.historyPath!, 'manifest.json')), unchangedHash)
      assert.ok(!JSON.stringify(changed).includes('SOURCE_SECRET_DO_NOT_LOG'))
    } finally {
      await admin?.end({ timeout: 1 })
      if (started) spawnSync('docker', ['stop', container], { timeout: 30_000, encoding: 'utf8' })
      assert.equal(path.dirname(parent), path.resolve(tmpdir()))
      assert.match(path.basename(parent), /^backup-update-flow-/)
      await rm(parent, { recursive: true, force: true })
      for (const workspace of workspaces) {
        assert.equal(path.dirname(workspace), path.resolve(tmpdir()))
        assert.match(path.basename(workspace), /^abu-[a-f\d]{16}$/)
        await rm(workspace, { recursive: true, force: true })
      }
      for (const backupRoot of cacheRoots) {
        const key = createHash('sha256')
          .update(JSON.stringify(backupRoot.toLowerCase()))
          .digest('hex')
        const cache = path.resolve('.artifacts/supabase-operations/backup-update-cache', key)
        assert.equal(
          path.dirname(cache),
          path.resolve('.artifacts/supabase-operations/backup-update-cache')
        )
        await rm(cache, { recursive: true, force: true })
      }
    }
  }
)
