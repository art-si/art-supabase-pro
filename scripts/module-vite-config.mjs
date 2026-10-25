import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { loadEnv } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import ElementPlus from 'unplugin-element-plus/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { createViteWatchPolicy } from './vite-watch-policy.mjs'
import { withSharedScssGlobals } from './scss-globals.mjs'
import { hostedModuleSharedDependencies } from './hosted-module-dependencies.mjs'
import { getElementPlusStyleDeps, matchElementPlusStyles } from './element-plus-style-chunks.mjs'

function createSourceTransformPattern(...roots) {
  const rootPattern = roots
    .map((root) =>
      root
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('|')
  return new RegExp(`^(?:${rootPattern})/.*\\.(?:ts|tsx|vue)(?:\\?.*)?$`)
}

function resolveComponentDirs({ applicationRoot, platformSourceRoot, componentScope }) {
  if (componentScope === 'without-finance-shell') {
    const businessRoot = path.join(platformSourceRoot, 'components/business')
    return [
      path.join(platformSourceRoot, 'components/core'),
      ...readdirSync(businessRoot, { withFileTypes: true })
        .filter(
          (entry) => entry.isDirectory() && entry.name !== 'finance-accounting-workspace-shell'
        )
        .map((entry) => path.join(businessRoot, entry.name))
    ]
  }

  const dirs = [path.join(platformSourceRoot, 'components')]
  if (componentScope === 'platform-and-local-modules') {
    dirs.push(path.join(applicationRoot, 'src/views/modules'))
  }
  return dirs
}

function createNoJekyllPlugin(appCode) {
  return {
    name: `${appCode}-no-jekyll`,
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' })
    }
  }
}

function createModuleTailwindSourcePlugin(applicationRoot, platformSourceRoot) {
  const stylesheetPath = path.join(platformSourceRoot, 'assets/styles/core/tailwind.css')
  const normalizedStylesheetPath = stylesheetPath.replace(/\\/g, '/')
  const moduleSourcePath = path
    .relative(path.dirname(stylesheetPath), path.join(applicationRoot, 'src'))
    .replace(/\\/g, '/')

  return {
    name: 'module-tailwind-source',
    enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0].replace(/\\/g, '/') !== normalizedStylesheetPath) return null
      return `${source}\n@source '${moduleSourcePath}';\n`
    }
  }
}

async function loadBuildLogPolicy(platformRoot) {
  const policyPath = path.join(platformRoot, 'scripts/build-log-policy.mjs')
  if (!existsSync(policyPath)) {
    console.warn('[vite] 当前平台版本未提供共享构建日志策略，未知警告将保持原样。')
    return null
  }
  const policyModule = await import(pathToFileURL(policyPath).href)
  return policyModule.createBuildLogPolicy()
}

/** Build the common Vite contract for independently runnable business modules. */
export async function createModuleViteConfig({
  appCode,
  applicationRoot,
  componentScope = 'platform',
  defaultPort,
  mode,
  platformRoot
}) {
  const platformSourceRoot = path.join(platformRoot, 'src')
  const sourceTransformPattern = createSourceTransformPattern(applicationRoot, platformSourceRoot)
  const platformEnv = loadEnv(mode, platformRoot, '')
  const applicationEnv = loadEnv(mode, applicationRoot, '')
  const env = { ...platformEnv, ...applicationEnv, VITE_APP_CODE: appCode }
  const exposedEnv = Object.fromEntries(
    Object.entries(env)
      .filter(([key, value]) => key.startsWith('VITE_') && value !== undefined)
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
  )
  const port = Number(env.VITE_PORT || defaultPort)
  const outDir = process.env.VITE_OUT_DIR || env.VITE_OUT_DIR || 'docs'
  const buildLogPolicy = await loadBuildLogPolicy(platformRoot)

  return {
    base: env.VITE_BASE_URL || '/',
    publicDir: path.join(platformRoot, 'public'),
    define: {
      __APP_VERSION__: JSON.stringify(env.VITE_VERSION || '1.0.0'),
      ...exposedEnv
    },
    server: {
      host: true,
      port,
      watch: mode === 'e2e' ? null : createViteWatchPolicy(outDir),
      hmr: mode === 'e2e' ? false : undefined,
      fs: { allow: [applicationRoot, platformRoot] }
    },
    preview: { host: true, port },
    resolve: {
      alias: {
        '@/router/core/platform-route-modules': path.join(
          platformSourceRoot,
          'router/core/standalone-route-modules.ts'
        ),
        [`@${appCode}`]: path.join(applicationRoot, 'src'),
        '@': platformSourceRoot,
        '@views': path.join(platformSourceRoot, 'views'),
        '@imgs': path.join(platformSourceRoot, 'assets/images'),
        '@icons': path.join(platformSourceRoot, 'assets/icons'),
        '@utils': path.join(platformSourceRoot, 'utils'),
        '@stores': path.join(platformSourceRoot, 'store'),
        '@styles': path.join(platformSourceRoot, 'assets/styles')
      },
      // A standalone module can share only dependencies installed at its own root.
      // Other platform dependencies retain normal package-relative resolution.
      dedupe: hostedModuleSharedDependencies.filter((dependency) =>
        existsSync(path.join(applicationRoot, 'node_modules', dependency))
      )
    },
    plugins: [
      createModuleTailwindSourcePlugin(applicationRoot, platformSourceRoot),
      {
        name: 'module-platform-favicon',
        transformIndexHtml: {
          order: 'pre',
          handler(html, context) {
            const faviconPath = path.join(platformSourceRoot, 'assets/images/favicon.ico')
            const faviconUrl = context.server
              ? `${context.server.config.base}@fs/${faviconPath.replace(/\\/g, '/')}`
              : path.relative(applicationRoot, faviconPath).replace(/\\/g, '/')
            return html.replaceAll('@/assets/images/favicon.ico', faviconUrl)
          }
        }
      },
      vue(),
      vueJsx(),
      tailwindcss(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        include: [sourceTransformPattern],
        exclude: [/[\\/]\.git[\\/]/],
        dts: false,
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })]
      }),
      Components({
        include: [sourceTransformPattern],
        exclude: [/[\\/]\.git[\\/]/],
        dirs: resolveComponentDirs({ applicationRoot, platformSourceRoot, componentScope }),
        deep: true,
        dts: false,
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })]
      }),
      ElementPlus({ useSource: true }),
      createNoJekyllPlugin(appCode),
      ...(buildLogPolicy ? [buildLogPolicy.summaryPlugin] : [])
    ],
    build: {
      target: 'es2020',
      outDir,
      emptyOutDir: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: buildLogPolicy?.chunkSizeWarningLimit ?? 2000,
      rolldownOptions: {
        ...buildLogPolicy?.rolldownOptions,
        output: {
          codeSplitting: {
            groups: [{ name: 'element-plus-styles', test: matchElementPlusStyles, priority: 95 }]
          }
        }
      }
    },
    css: {
      // 与宿主保持一致，避免多个子仓各自占满样式编译线程。
      preprocessorMaxWorkers: 4,
      preprocessorOptions: {
        scss: {
          additionalData: withSharedScssGlobals
        }
      }
    },
    optimizeDeps: {
      entries: ['index.html', 'src/views/**/*.vue'],
      exclude: getElementPlusStyleDeps(applicationRoot),
      include: [
        'vue',
        'vue-router',
        'pinia',
        'element-plus/es',
        'element-plus/es/components/table-v2/index.mjs'
      ]
    }
  }
}
