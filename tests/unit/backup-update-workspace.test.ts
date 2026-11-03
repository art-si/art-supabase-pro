import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  refreshBackupDirectoryTimestamp,
  createBackupUpdateWorkspace,
  commitBackupUpdate,
  recoverBackupUpdate,
  acquireBackupUpdateSession,
  cleanBackupUpdateWorkspace
} from '../../scripts/lib/backup-update-workspace'
import {
  assertExternalUpdateReportPath,
  exists,
  fileHash,
  writeJson,
  makeSnapshotManifest
} from '../../scripts/lib/backup-update-io'

const completedAt = new Date(2026, 10, 1, 19, 23, 45)
const latestName = '20261101-192345'
const options = { skip: process.platform !== 'win32' }

test('update reports cannot add unlisted files inside the original or renamed snapshot', () => {
  for (const root of [
    path.resolve('backups/20261030-215709'),
    path.resolve('backups/20261101-192345')
  ]) {
    assert.throws(
      () => assertExternalUpdateReportPath(path.join(root.toUpperCase(), 'report.json'), root),
      /不能写入备份目录/
    )
    assert.throws(() => assertExternalUpdateReportPath(root, root), /不能写入备份目录/)
    assert.doesNotThrow(() => assertExternalUpdateReportPath(root + '.report.json', root))
  }
})

async function snapshot(parent: string): Promise<{ root: string; hash: string }> {
  const root = path.join(parent, '20261030-215709')
  await mkdir(path.join(root, 'database'), { recursive: true })
  const data = path.join(root, 'database/data.sql')
  await writeFile(data, 'verified snapshot\n')
  await writeJson(path.join(root, 'manifest.json'), {
    format_version: 1,
    project_ref: 'ckbftoopuyophiebamwy',
    files: [{ path: 'database/data.sql', bytes: 18, sha256: await fileHash(data) }]
  })
  return { root, hash: await fileHash(path.join(root, 'manifest.json')) }
}

test(
  'successful snapshot gets the completion timestamp without relabeling the old ZIP or history',
  options,
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'backup-timestamp-'))
    try {
      const { root, hash } = await snapshot(parent)
      await writeFile(root + '.zip', 'previous distribution snapshot')
      await mkdir(root + '.history')
      await writeFile(
        path.join(root, 'README.md'),
        `\uFEFF# Supabase backup 20261030-215709\nRestore: -BackupPath '${root}'\nPackage: '${root.toUpperCase()}'\nForward: '${root.split(path.sep).join('/')}'`
      )
      const { backupPath: latest, warnings } = await refreshBackupDirectoryTimestamp(
        root,
        hash,
        completedAt
      )
      assert.equal(latest, path.join(parent, latestName))
      assert.equal(await exists(root), false)
      assert.equal(await fileHash(path.join(latest, 'manifest.json')), hash)
      assert.equal(
        await readFile(path.join(latest, 'database/data.sql'), 'utf8'),
        'verified snapshot\n'
      )
      assert.equal(await readFile(root + '.zip', 'utf8'), 'previous distribution snapshot')
      assert.equal(await exists(root + '.history'), true)
      assert.deepEqual(warnings, [])
      assert.equal(
        await readFile(path.join(latest, 'README.md'), 'utf8'),
        `\uFEFF# Supabase backup ${latestName}\nRestore: -BackupPath '${latest}'\nPackage: '${latest}'\nForward: '${latest.split(path.sep).join('/')}'`
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }
)

test('same-second backups and existing distributions are never overwritten', options, async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'backup-timestamp-collision-'))
  try {
    const { root, hash } = await snapshot(parent)
    const occupied = path.join(parent, latestName)
    await mkdir(occupied)
    await writeFile(path.join(occupied, 'keep.txt'), 'existing backup')
    await writeFile(occupied + '-1.zip', 'existing package')
    await mkdir(occupied + '-2.incomplete')
    const { backupPath: latest } = await refreshBackupDirectoryTimestamp(root, hash, completedAt)
    assert.equal(latest, occupied + '-3')
    assert.equal(await readFile(path.join(occupied, 'keep.txt'), 'utf8'), 'existing backup')
    assert.equal(await readFile(occupied + '-1.zip', 'utf8'), 'existing package')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test(
  'invalid snapshots and pending commits retain their original directory timestamp',
  options,
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'backup-timestamp-invalid-'))
    try {
      const { root, hash } = await snapshot(parent)
      await writeFile(path.join(root, 'database/data.sql'), 'corrupted')
      await assert.rejects(
        refreshBackupDirectoryTimestamp(root, hash, completedAt),
        /文件与完成清单不一致/
      )
      assert.equal(await exists(root), true)
      assert.equal(await exists(path.join(parent, latestName)), false)
      await mkdir(root + '.update-work')
      await writeJson(path.join(root + '.update-work', 'transaction.json'), {})
      await assert.rejects(refreshBackupDirectoryTimestamp(root, hash, completedAt), /提交尚未完成/)
      assert.equal(await exists(root), true)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }
)

test(
  'a snapshot already named for this completion second stays at its valid path',
  options,
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'backup-timestamp-current-'))
    try {
      const { root, hash } = await snapshot(parent)
      const { backupPath: latest } = await refreshBackupDirectoryTimestamp(root, hash, completedAt)
      assert.equal(
        (await refreshBackupDirectoryTimestamp(latest, hash, completedAt)).backupPath,
        latest
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }
)

const project = 'ckbftoopuyophiebamwy'

async function fixture(): Promise<{
  parent: string
  root: string
  manifest: Record<string, unknown>
}> {
  const parent = await mkdtemp(path.join(tmpdir(), 'backup-update-fs-')),
    root = path.join(parent, '备份')
  await mkdir(root)
  const files = []
  for (const [name, body] of [
    ['a.txt', 'first-old'],
    ['b.txt', 'second-old']
  ]) {
    await writeFile(path.join(root, name), body)
    files.push({
      path: name,
      bytes: Buffer.byteLength(body),
      sha256: createHash('sha256').update(body).digest('hex')
    })
  }
  const manifest = { format_version: 1, project_ref: project, files }
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
  return { parent, root, manifest }
}

async function cleanup(parent: string, workspace?: string): Promise<void> {
  assert.equal(path.dirname(parent), path.resolve(tmpdir()))
  assert.match(path.basename(parent), /^backup-update-fs-/)
  await rm(parent, { recursive: true, force: true })
  if (workspace) {
    assert.equal(path.dirname(workspace), path.resolve(tmpdir()))
    assert.match(path.basename(workspace), /^abu-[a-f\d]{16}$/)
    await rm(workspace, { recursive: true, force: true })
  }
}

test(
  'temporary workspace cleanup requires its owner and preserves the committed snapshot',
  options,
  async () => {
    const { parent, root } = await fixture()
    const planId = randomUUID()
    let workspace: Awaited<ReturnType<typeof createBackupUpdateWorkspace>> | undefined
    try {
      workspace = await createBackupUpdateWorkspace(root, planId)
      await assert.rejects(
        cleanBackupUpdateWorkspace(workspace.root, root, randomUUID()),
        /身份不匹配/
      )
      assert.equal(await exists(workspace.root), true)
      const before = await fileHash(path.join(root, 'manifest.json'))
      await commitBackupUpdate(root, workspace.snapshot, before)
      await cleanBackupUpdateWorkspace(workspace.root, root, planId)
      assert.equal(await exists(workspace.root), false)
      assert.equal(await fileHash(path.join(root, 'manifest.json')), before)
      assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'first-old')
    } finally {
      await cleanup(parent, workspace?.root)
    }
  }
)

test(
  'same-folder snapshot commits changed/new/deleted files and preserves the old archive',
  { skip: process.platform !== 'win32', timeout: 120_000 },
  async () => {
    const { parent, root, manifest } = await fixture()
    let work: string | undefined
    try {
      const before = await fileHash(path.join(root, 'manifest.json'))
      const stage = await createBackupUpdateWorkspace(root, randomUUID())
      work = stage.root
      await writeFile(path.join(stage.snapshot, 'a.txt'), 'new-content')
      await rm(path.join(stage.snapshot, 'b.txt'))
      await writeFile(path.join(stage.snapshot, 'c.txt'), 'added')
      await makeSnapshotManifest(stage.snapshot, manifest, before)
      const result = await commitBackupUpdate(root, stage.snapshot, before)
      assert.equal(result.changedFiles, 2)
      assert.equal(result.removedFiles, 1)
      assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'new-content')
      assert.equal(await readFile(path.join(result.historyPath, 'a.txt'), 'utf8'), 'first-old')
      assert.equal(await readFile(path.join(result.historyPath, 'b.txt'), 'utf8'), 'second-old')
      assert.equal(await recoverBackupUpdate(root), false)
      await assert.rejects(commitBackupUpdate(root, stage.snapshot, before), /版本已变化/)
    } finally {
      await cleanup(parent, work)
    }
  }
)

test(
  'an occupied target file cannot produce a partial successful update; prior changes roll back',
  { skip: process.platform !== 'win32', timeout: 120_000 },
  async () => {
    const { parent, root, manifest } = await fixture()
    let work: string | undefined
    let holder: ReturnType<typeof spawn> | undefined
    try {
      const before = await fileHash(path.join(root, 'manifest.json'))
      const stage = await createBackupUpdateWorkspace(root, randomUUID())
      work = stage.root
      await writeFile(path.join(stage.snapshot, 'a.txt'), 'first-new')
      await writeFile(path.join(stage.snapshot, 'b.txt'), 'second-new')
      await makeSnapshotManifest(stage.snapshot, manifest, before)
      const script = path.join(parent, 'hold.ps1')
      await writeFile(
        script,
        "param([string]$Target)\n$s=[IO.File]::Open($Target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\n[Console]::Out.WriteLine('HELD');[Console]::Out.Flush();[void][Console]::In.ReadToEnd();$s.Dispose()"
      )
      holder = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-File', script, '-Target', path.join(root, 'b.txt')],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      await new Promise<void>((resolve, reject) => {
        holder!.stdout!.once('data', () => resolve())
        holder!.once('error', reject)
      })
      await assert.rejects(commitBackupUpdate(root, stage.snapshot, before), /已恢复原完整备份/)
      assert.equal(await fileHash(path.join(root, 'manifest.json')), before)
      assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'first-old')
      assert.equal(await readFile(path.join(root, 'b.txt'), 'utf8'), 'second-old')
      assert.equal(await recoverBackupUpdate(root), false)
    } finally {
      if (holder) {
        const closed = new Promise<void>((resolve) => holder!.once('close', () => resolve()))
        holder.stdin!.end()
        await closed
      }
      await cleanup(parent, work)
    }
  }
)

test(
  'the per-backup session rejects a concurrent updater and releases after completion',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  async () => {
    const { parent, root } = await fixture()
    const release = await acquireBackupUpdateSession(root)
    try {
      await assert.rejects(acquireBackupUpdateSession(root), /(?:正在|正被).*使用|保护锁/)
    } finally {
      await release()
      await cleanup(parent)
    }
  }
)

test(
  'interrupted file submission restores the old snapshot and removes only its registered temporary files',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  async () => {
    const { parent, root, manifest } = await fixture()
    try {
      const oldHash = await fileHash(path.join(root, 'manifest.json'))
      const history = path.join(root + '.history', 'fixture')
      await mkdir(history, { recursive: true })
      for (const name of ['a.txt', 'b.txt', 'manifest.json'])
        await copyFile(path.join(root, name), path.join(history, name))
      const nonce = '0123456789ab'
      await writeFile(path.join(root, 'a.txt'), 'partially-new')
      await writeFile(path.join(root, 'c.txt'), 'new-addition')
      await writeFile(path.join(root, `b.txt.update-r-${nonce}.tmp`), 'interrupted-copy')
      await mkdir(root + '.update-work')
      await writeFile(
        path.join(root + '.update-work', 'transaction.json'),
        JSON.stringify({
          version: 1,
          backupPath: root,
          phase: 'committing',
          historyPath: history,
          oldManifestSha256: oldHash,
          newManifestSha256: 'f'.repeat(64),
          oldFiles: manifest.files,
          changed: ['a.txt'],
          additions: ['c.txt'],
          removals: ['b.txt'],
          nonce
        })
      )
      assert.equal(await recoverBackupUpdate(root), true)
      assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'first-old')
      assert.equal(await readFile(path.join(root, 'b.txt'), 'utf8'), 'second-old')
      assert.equal(await fileHash(path.join(root, 'manifest.json')), oldHash)
      await assert.rejects(readFile(path.join(root, 'c.txt')))
      await assert.rejects(readFile(path.join(root, `b.txt.update-r-${nonce}.tmp`)))
      assert.equal(await recoverBackupUpdate(root), false)
    } finally {
      await cleanup(parent)
    }
  }
)
