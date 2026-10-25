import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, extname, join } from 'node:path'
import { icons } from '@iconify-json/ri'
import { icons as vaadinIcons } from '@iconify-json/vaadin'
import { icons as dashicons } from '@iconify-json/dashicons'
import { icons as iconamoonIcons } from '@iconify-json/iconamoon'
import { icons as fluentIcons } from '@iconify-json/fluent'
import { icons as iconParkIcons } from '@iconify-json/icon-park-outline'
import { icons as ixIcons } from '@iconify-json/ix'
import { icons as solarIcons } from '@iconify-json/solar'
import { pick, uniq } from 'lodash-es'

const outputPath = resolve('src/assets/icons/collections.generated.json')
const sourceExtensions = new Set(['.ts', '.tsx', '.vue', '.json'])
const ignoredDirectories = new Set(['.git', 'node_modules', 'docs', 'dist', '.artifacts'])

async function collectSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      files.push(...(await collectSourceFiles(path)))
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(path)
    }
  }
  return files
}

const files = (await Promise.all(['src', 'modules'].map(collectSourceFiles))).flat().sort()
const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')))
const collections = [
  icons,
  vaadinIcons,
  dashicons,
  iconamoonIcons,
  fluentIcons,
  iconParkIcons,
  ixIcons,
  solarIcons
]
  .map((collection) => {
    const pattern = new RegExp(`\\b${collection.prefix}:([a-z0-9-]+)`, 'g')
    const names = uniq(
      sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => match[1]))
    ).sort()
    const missing = names.filter((name) => !Object.hasOwn(collection.icons, name))
    if (missing.length) throw new Error(`不存在的 ${collection.prefix} 图标：${missing.join('、')}`)
    return {
      prefix: collection.prefix,
      width: collection.width,
      height: collection.height,
      icons: pick(collection.icons, names)
    }
  })
  .filter((collection) => Object.keys(collection.icons).length > 0)
const generated = `${JSON.stringify(collections, null, 2)}\n`

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8')
  if (current.replaceAll('\r\n', '\n') !== generated) {
    throw new Error('本地图标数据已过期，请运行 pnpm icons:generate')
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, generated)
}
console.info(
  `本地图标${process.argv.includes('--check') ? '检查通过' : '已生成'}（${collections.reduce((total, collection) => total + Object.keys(collection.icons).length, 0)} 个）`
)
