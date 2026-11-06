import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const platformRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const applicationRoot = realpathSync(process.cwd())
if (applicationRoot === platformRoot)
  throw new Error('Run this command from the consuming application.')
const manifest = JSON.parse(readFileSync(path.join(applicationRoot, 'package.json'), 'utf8'))
if (!manifest.dependencies?.['art-supabase-pro'])
  throw new Error('The application must declare art-supabase-pro as a dependency.')

if (process.argv.includes('--link-skills')) {
  const parent = path.join(applicationRoot, '.agents')
  if (existsSync(parent) && realpathSync(parent).toLowerCase() !== parent.toLowerCase())
    throw new Error('The application .agents directory must not redirect outside the workspace.')
  const destination = path.join(parent, 'skills')
  mkdirSync(destination, { recursive: true })
  if (realpathSync(destination).toLowerCase() !== destination.toLowerCase())
    throw new Error('The skills registration directory must be owned by the application.')
  const source = path.join(platformRoot, '.agents/skills')
  let linked = 0
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = path.join(destination, entry.name)
    if (
      existsSync(target) ||
      (() => {
        try {
          return lstatSync(target).isSymbolicLink()
        } catch {
          return false
        }
      })()
    ) {
      if (!lstatSync(target).isSymbolicLink())
        throw new Error(`Remove the duplicated local skill before linking: ${target}`)
      unlinkSync(target)
    }
    symlinkSync(
      path.join(source, entry.name),
      target,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    linked++
  }
  console.log(
    `Registered ${linked} shared skill packages; their content remains in art-supabase-pro.`
  )
} else {
  const duplicates = []
  const roots = [
    'components',
    'hooks',
    'utils',
    'store',
    'assets',
    'locales',
    'directives',
    'enums',
    'config',
    'types'
  ]
  const visit = (directory, relative) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`
      if (entry.isDirectory()) visit(path.join(directory, entry.name), name)
      else if (entry.isFile() && existsSync(path.join(platformRoot, name))) duplicates.push(name)
    }
  }
  for (const name of roots) visit(path.join(applicationRoot, 'src', name), `src/${name}`)
  if (duplicates.length)
    throw new Error(`Platform source must be reused from the package:\n${duplicates.join('\n')}`)
  console.log('Platform consumer boundary passed: no duplicated shared source files.')
}
