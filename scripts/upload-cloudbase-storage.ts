import { spawn } from 'node:child_process'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface UploadState {
  environmentId: string
  uploaded: string[]
  updatedAt: string
}

interface ExpectedCount {
  bucket_id: string
  object_count: number
}

const normalizePath = (value: string) => value.replace(/\\/gu, '/')

export const resolveBucketRoot = (storageRoot: string, bucketId: string) =>
  path.join(storageRoot, bucketId, bucketId)

export const toObjectKey = (bucketRoot: string, filePath: string) => {
  const relative = path.relative(bucketRoot, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Storage file is outside bucket root: ${filePath}`)
  }
  return normalizePath(relative)
}

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(target)))
    else if (entry.isFile()) files.push(target)
  }
  return files
}

const run = (command: string, args: string[], environment: NodeJS.ProcessEnv) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else {
        let message = stderr.trim()
        try {
          const payload = JSON.parse(stdout) as {
            error?: { code?: string; message?: string }
          }
          if (payload.error?.code || payload.error?.message) {
            message = `${payload.error.code ?? 'UPLOAD_FAILED'}: ${payload.error.message ?? 'Upload failed'}`
          }
        } catch {
          // Non-JSON CLI output is summarized without echoing object paths or credentials.
        }
        reject(new Error(message || `Upload command exited with ${code}`))
      }
    })
  })

const parseArguments = (argv: string[]) => {
  const args = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value) throw new Error(`Invalid argument near ${key ?? '<end>'}`)
    args.set(key.slice(2), value)
  }
  return args
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const storageRoot = path.resolve(args.get('storage-root') ?? '')
  const environmentId = args.get('env')
  const metadataPath = args.get('counts')
  if (!storageRoot || !environmentId || !metadataPath) {
    throw new Error('--storage-root, --env and --counts are required')
  }
  const tcb = path.resolve(
    args.get('tcb') ??
      'C:/Users/EDY/AppData/Local/npm-cache/_npx/88bda5ef0319b729/node_modules/@cloudbase/cli/bin/tcb'
  )
  await stat(tcb)
  const counts = JSON.parse(await readFile(path.resolve(metadataPath), 'utf8')) as ExpectedCount[]
  const statePath = path.join(storageRoot, '.cloudbase-upload-state.json')
  let state: UploadState
  try {
    state = JSON.parse(await readFile(statePath, 'utf8')) as UploadState
    if (state.environmentId !== environmentId)
      throw new Error('Upload state belongs to another environment')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    state = { environmentId, uploaded: [], updatedAt: new Date().toISOString() }
  }
  const uploaded = new Set(state.uploaded)
  const jobs: Array<{ bucket: string; file: string; key: string }> = []

  for (const count of counts) {
    const bucketRoot = resolveBucketRoot(storageRoot, count.bucket_id)
    const files = await listFiles(bucketRoot)
    if (files.length !== Number(count.object_count)) {
      throw new Error(
        `Bucket ${count.bucket_id} expected ${count.object_count} files but found ${files.length}`
      )
    }
    for (const file of files) {
      const key = toObjectKey(bucketRoot, file)
      if (!uploaded.has(`${count.bucket_id}:${key}`))
        jobs.push({ bucket: count.bucket_id, file, key })
    }
  }

  const concurrency = Math.max(1, Math.min(6, Number(args.get('concurrency') ?? 3)))
  let cursor = 0
  let completed = uploaded.size
  let stateWrite = Promise.resolve()
  const saveState = () => {
    state.uploaded = [...uploaded].sort()
    state.updatedAt = new Date().toISOString()
    stateWrite = stateWrite.then(() =>
      writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    )
    return stateWrite
  }

  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor]
      cursor += 1
      await run(
        process.execPath,
        [
          tcb,
          'storage',
          'objects',
          'upload',
          job.file,
          job.key,
          '--bucket',
          job.bucket,
          '--env-id',
          environmentId,
          '--region',
          args.get('region') ?? 'ap-shanghai',
          '--upsert',
          '--json'
        ],
        { ...process.env, TCB_DISABLE_REPORT: '1' }
      )
      uploaded.add(`${job.bucket}:${job.key}`)
      completed += 1
      await saveState()
      process.stdout.write(
        `${JSON.stringify({ completed, total: uploaded.size + jobs.length - cursor })}\n`
      )
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  await stateWrite
  process.stdout.write(`${JSON.stringify({ uploaded: uploaded.size, remaining: 0 })}\n`)
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Storage upload failed'}\n`)
    process.exitCode = 1
  })
}
