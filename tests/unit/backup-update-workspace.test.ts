import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { refreshBackupDirectoryTimestamp } from '../../scripts/lib/backup-update-workspace'
import {
  assertExternalUpdateReportPath,
  exists,
  fileHash,
  writeJson
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
