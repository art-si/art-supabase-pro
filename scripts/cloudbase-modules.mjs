import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'scripts/cloudbase-modules.json')

function git(args, cwd = root, stream = false) {
  const result = spawnSync('git', ['-c', 'http.version=HTTP/1.1', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: stream ? 'inherit' : 'pipe'
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.status}`)
  }
  return result.stdout?.trim() || ''
}

function fromIndex() {
  return git(['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'])
    .split('\n')
    .map((line) => {
      const separator = line.indexOf(' ')
      const key = line.slice(0, separator).replace(/\.path$/, '.url')
      const path = line.slice(separator + 1).trim()
      return {
        path,
        url: git(['config', '--file', '.gitmodules', '--get', key]),
        ref: git(['rev-parse', `:${path}`])
      }
    })
}

function validate(modules) {
  if (!Array.isArray(modules) || modules.length === 0) throw new Error('Empty module manifest')
  for (const module of modules) {
    if (!module || typeof module.path !== 'string' || typeof module.url !== 'string') {
      throw new Error('Invalid module manifest entry')
    }
    const path = relative(root, resolve(root, module.path))
    if (isAbsolute(path) || !path.replaceAll('\\', '/').startsWith('modules/')) {
      throw new Error(`Module path is outside modules: ${module.path}`)
    }
    if (!/^https:\/\/(?:gitee\.com|github\.com)\/art-si\/[\w-]+\.git$/.test(module.url)) {
      throw new Error(`Unexpected module URL: ${module.url}`)
    }
    if (typeof module.ref !== 'string' || !/^[a-f0-9]{40}$/.test(module.ref)) {
      throw new Error(`Invalid module revision: ${module.path}`)
    }
  }
}

const action = process.argv[2]
if (action === 'write') {
  const modules = fromIndex()
  validate(modules)
  writeFileSync(manifestPath, `${JSON.stringify(modules, null, 2)}\n`)
  console.log(`Recorded ${modules.length} module revisions from the Git index`)
} else if (action === 'check') {
  const modules = JSON.parse(readFileSync(manifestPath, 'utf8'))
  validate(modules)
  if (JSON.stringify(modules) !== JSON.stringify(fromIndex())) {
    throw new Error('CloudBase module manifest does not match the Git index')
  }
  console.log(`Verified ${modules.length} pinned module revisions`)
} else if (action === 'install') {
  const modules = JSON.parse(readFileSync(manifestPath, 'utf8'))
  validate(modules)
  for (const module of modules) {
    const cwd = resolve(root, module.path)
    if (existsSync(resolve(cwd, '.git'))) {
      if (git(['rev-parse', 'HEAD'], cwd) !== module.ref) {
        throw new Error(`Existing module revision differs: ${module.path}`)
      }
      continue
    }
    git(['init', module.path], root, true)
    git(['remote', 'add', 'origin', module.url], cwd)
    git(['fetch', '--depth=1', 'origin', module.ref], cwd, true)
    git(['checkout', '--detach', 'FETCH_HEAD'], cwd, true)
  }
} else {
  throw new Error('Expected write, check, or install')
}
