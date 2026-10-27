import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import templateCompilerOptions from '@tresjs/core/template-compiler-options'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import ElementPlus from 'unplugin-element-plus/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import tailwindcss from '@tailwindcss/vite'
import { createBuildLogPolicy } from './scripts/build-log-policy.mjs'
import { createViteWatchPolicy } from './scripts/vite-watch-policy.mjs'
import { withSharedScssGlobals } from './scripts/scss-globals.mjs'
import {
  getElementPlusStyleDeps,
  matchElementPlusStyles
} from './scripts/element-plus-style-chunks.mjs'
import { platformChunkFileName, shouldPreloadHtmlDependency } from './scripts/bundle-boundaries.ts'
import {
  createFileViewerAssetSyncPlugin,
  REDUNDANT_FILE_VIEWER_ASSETS
} from './scripts/file-viewer-asset-sync.ts'
import {
  hostedApplicationSourceDirectories,
  hostedModuleSharedDependencies
} from './scripts/hosted-module-dependencies.mjs'

// 添加插件用于生成 .nojekyll 文件
import { createNoJekyllPlugin } from './src/plugins/nojekyll.ts'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageRequire = createRequire(path.join(configDirectory, 'package.json'))
const excelRequire = createRequire(packageRequire.resolve('exceljs/package.json'))

const normalizeModuleId = (id: string) => id.replace(/\\/g, '/')

const matchPackages = (id: string, packages: string[]) => {
  const normalizedId = normalizeModuleId(id)
  return packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}`))
}

const matchFrameworkPackages = (id: string) => {
  const normalizedId = normalizeModuleId(id)
  const packageRoots = [
    'vue',
    'vue-router',
    'vue-i18n',
    'vue-demi',
    'pinia',
    'pinia-plugin-persistedstate'
  ]

  return (
    packageRoots.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`)) ||
    normalizedId.includes('/node_modules/@vue/') ||
    normalizedId.includes('/node_modules/@vueuse/')
  )
}

const matchBuildRuntime = (id: string) => {
  const normalizedId = normalizeModuleId(id)
  return (
    matchPackages(id, ['@babel/runtime', 'tslib']) ||
    normalizedId.includes('@oxc-project+runtime') ||
    normalizedId.includes('@oxc-project/runtime') ||
    normalizedId.includes('__vite-browser-external') ||
    normalizedId.includes('commonjsHelpers') ||
    normalizedId.includes('vite/preload-helper') ||
    normalizedId.includes('vite/modulepreload-polyfill')
  )
}

export default async ({ mode }: { mode: string }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const { VITE_VERSION, VITE_PORT, VITE_BASE_URL, VITE_API_URL, VITE_API_PROXY_URL, VITE_OUT_DIR } =
    env
  const isProduction = mode === 'production' || mode === 'cloudbase'
  const isE2E = mode === 'e2e'
  const enableGeneratedDeclarations = !isProduction && !isE2E
  const enableBuildCompression = env.VITE_BUILD_COMPRESS === 'true'
  const enableBundleAnalyzer =
    env.VITE_BUILD_ANALYZE === 'true' || process.env.VITE_BUILD_ANALYZE === 'true'
  const enableVueDevTools = env.VITE_DEVTOOLS === 'true'
  const enableFileViewerPlugin = !isE2E && (isProduction || env.VITE_FILE_VIEWER === 'true')
  const enableFileViewerAssets = !isE2E && (isProduction || env.VITE_FILE_VIEWER_ASSETS === 'true')
  const enableCloudBaseSdk = mode === 'cloudbase' || env.VITE_BAAS_PROVIDER === 'cloudbase'
  const [devToolsModule, compressionModule, fileViewerModule, analyzerModule] = await Promise.all([
    !isProduction && !isE2E && enableVueDevTools ? import('vite-plugin-vue-devtools') : undefined,
    enableBuildCompression ? import('vite-plugin-compression') : undefined,
    enableFileViewerPlugin ? import('@file-viewer/vite-plugin') : undefined,
    enableBundleAnalyzer ? import('rollup-plugin-visualizer') : undefined
  ])
  const outDir =
    process.env.VITE_OUT_DIR || (isE2E ? '.artifacts/e2e-build' : VITE_OUT_DIR || 'dist')
  const fileViewerAssetStageDir = path.resolve(
    root,
    'node_modules/.cache/art-supabase-pro/file-viewer-assets'
  )
  const elementPlusStyleDeps = getElementPlusStyleDeps(root)
  const buildLogPolicy = createBuildLogPolicy()
  const fileViewerPlugin = fileViewerModule
    ? fileViewerModule.fileViewerRenderers({
        preset: 'all',
        inject: false,
        copyAssets: enableFileViewerAssets
          ? { mode: 'build', outDir: fileViewerAssetStageDir }
          : false,
        chunkStrategy: 'none'
      })
    : null
  if (isProduction && fileViewerPlugin) {
    // Direct preset imports and our chunk rules already cover the config hook's work.
    // Skip its repeated optional-package resolution; retain build hooks for viewer assets.
    fileViewerPlugin.config = undefined
  }
  const hostedApplicationAliases = Object.fromEntries(
    Object.entries(hostedApplicationSourceDirectories)
      .filter(([, sourceDirectory]) => existsSync(path.resolve(root, sourceDirectory)))
      .map(([alias, sourceDirectory]) => [alias, resolvePath(sourceDirectory)])
  )

  console.log(`[vite] API_URL=${VITE_API_URL}`)
  console.log(`[vite] VERSION=${VITE_VERSION}`)
  console.log(`[vite] outDir=${outDir}`)

  return defineConfig({
    cacheDir: path.resolve(root, 'node_modules/.vite', mode),
    define: {
      __APP_VERSION__: JSON.stringify(VITE_VERSION),
      __CLOUDBASE_BUILD__: JSON.stringify(enableCloudBaseSdk)
    },
    base: VITE_BASE_URL,
    server: {
      port: Number(VITE_PORT),
      // 提前转换静态依赖，避免浏览器逐层请求造成首屏转换瀑布。
      preTransformRequests: !isE2E,
      // 浏览器回归期间固定页面，避免并发文件修改导致弹窗与测试输入丢失。
      watch: isE2E ? null : createViteWatchPolicy(outDir),
      hmr: isE2E ? false : undefined,
      proxy: {
        '/api': {
          target: VITE_API_PROXY_URL,
          changeOrigin: true
        }
      },
      host: true
    },
    // 路径别名
    resolve: {
      dedupe: [...new Set([...hostedModuleSharedDependencies, 'three'])],
      alias: [
        ...(enableCloudBaseSdk
          ? []
          : [
              {
                find: /^@cloudbase\/js-sdk$/,
                replacement: resolvePath('src/plugins/cloudbase-sdk-disabled.ts')
              }
            ]),
        // ES2020 supplies the native APIs omitted by ExcelJS's official bare build.
        {
          find: /^exceljs$/,
          replacement: packageRequire.resolve('exceljs/dist/exceljs.bare.min.js')
        },
        // Both current consumers use JSZip 3.10.2; resolve their browser runtime once.
        {
          find: /^jszip(?:\/dist\/jszip(?:\.min)?\.js)?$/,
          replacement: excelRequire.resolve('jszip/dist/jszip.min.js')
        },
        ...Object.entries({
          ...hostedApplicationAliases,
          '@': fileURLToPath(new URL('./src', import.meta.url)),
          '@views': resolvePath('src/views'),
          '@imgs': resolvePath('src/assets/images'),
          '@icons': resolvePath('src/assets/icons'),
          '@utils': resolvePath('src/utils'),
          '@stores': resolvePath('src/store'),
          '@styles': resolvePath('src/assets/styles')
        }).map(([find, replacement]) => ({ find, replacement }))
      ]
    },
    build: {
      target: 'es2020',
      outDir, //dist
      modulePreload: {
        polyfill: false,
        resolveDependencies: (_filename, dependencies, context) => {
          if (context.hostType !== 'html') return dependencies
          return dependencies.filter(shouldPreloadHtmlDependency)
        }
      },
      chunkSizeWarningLimit: buildLogPolicy.chunkSizeWarningLimit,
      minify: 'oxc',
      cssMinify: 'lightningcss',
      reportCompressedSize: false,
      rolldownOptions: {
        ...buildLogPolicy.rolldownOptions,
        output: {
          chunkFileNames: platformChunkFileName,
          codeSplitting: {
            groups: [
              {
                name: 'build-runtime',
                test: matchBuildRuntime,
                priority: 120
              },
              {
                // Keep Vue's runtime out of feature chunks. Otherwise the entry imports
                // Vue helpers from the 15 MB file-viewer chunk and preloads it on every page.
                name: 'framework',
                test: matchFrameworkPackages,
                priority: 100
              },
              {
                // Frequently used Element Plus controls load with the shell; other
                // component styles remain with their routes to limit first-screen CSS.
                name: 'element-plus-styles',
                test: matchElementPlusStyles,
                priority: 95
              },
              {
                // These utilities are shared by Element Plus, tables and feature renderers.
                // Giving them their own chunk prevents a feature chunk becoming their owner.
                name: 'common-utils',
                test: (id) =>
                  matchPackages(id, [
                    'lodash',
                    'lodash-es',
                    'lodash-unified',
                    'dayjs',
                    'sortablejs',
                    'vue-draggable-plus'
                  ]),
                priority: 90
              },
              {
                name: 'media',
                test: (id) => matchPackages(id, ['xgplayer', 'hls.js']),
                priority: 45
              },
              {
                name: 'local-ocr',
                test: (id) => matchPackages(id, ['tesseract.js/']),
                priority: 45
              },
              {
                name: 'monaco',
                test: (id) =>
                  matchPackages(id, [
                    'monaco-editor',
                    'monaco-sql-languages',
                    '@guolao/vue-monaco-editor',
                    '@monaco-editor/loader',
                    'state-local'
                  ]),
                priority: 40
              },
              {
                name: 'charts',
                test: (id) => matchPackages(id, ['echarts', 'zrender']),
                priority: 30
              },
              {
                name: '3d-runtime',
                test: (id) => matchPackages(id, ['three', '@tresjs']),
                priority: 30
              },
              {
                name: 'rich-editor',
                test: (id) => matchPackages(id, ['@tiptap']),
                priority: 30
              },
              {
                name: 'data-tools',
                test: (id) =>
                  matchPackages(id, ['xlsx', 'sql-formatter', 'node-sql-parser', 'crypto-js']),
                priority: 20
              }
            ]
          }
        }
      },
      dynamicImportVarsOptions: {
        warnOnError: true,
        exclude: [],
        include: ['src/views/**/*.vue']
      }
    },
    worker: {
      rolldownOptions: {
        checks: {
          invalidAnnotation: false,
          pluginTimings: false
        }
      }
    },
    plugins: [
      {
        name: 'isolate-dev-server-cache',
        apply: 'serve',
        config(config) {
          // config 钩子能读取 CLI 合并后的监听地址和端口。
          // IPv4 / IPv6 服务即使共用端口也不能覆盖彼此的依赖预构建产物。
          const host = config.server?.host
          const cacheHost = (typeof host === 'string' ? host : host ? 'all' : 'localhost').replace(
            /[^a-z0-9.-]/gi,
            '_'
          )
          return {
            cacheDir: path.resolve(
              root,
              'node_modules/.vite',
              `${mode}-${cacheHost}-${config.server?.port ?? 5173}`
            )
          }
        }
      },
      vue({ ...templateCompilerOptions }),
      vueJsx(),
      tailwindcss(),
      ...(fileViewerPlugin ? [fileViewerPlugin] : []),
      createFileViewerAssetSyncPlugin({
        enabled: enableFileViewerPlugin && enableFileViewerAssets,
        sourceRoot: fileViewerAssetStageDir,
        excludedFiles: REDUNDANT_FILE_VIEWER_ASSETS
      }),
      buildLogPolicy.summaryPlugin,
      // 自动按需导入 API
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        dts: enableGeneratedDeclarations ? 'src/types/import/auto-imports.d.ts' : false,
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
        eslintrc: {
          enabled: enableGeneratedDeclarations,
          filepath: './.auto-import.json',
          globalsPropValue: true
        }
      }),
      // 自动按需导入组件
      Components({
        dirs: [resolvePath('src/components')],
        dts: enableGeneratedDeclarations ? 'src/types/import/components.d.ts' : false,
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })]
      }),
      // 按需定制主题配置
      ElementPlus({
        useSource: true
      }),
      // 压缩
      ...(compressionModule
        ? [
            compressionModule.default({
              verbose: false, // 是否在控制台输出压缩结果
              disable: false, // 是否禁用
              algorithm: 'gzip', // 压缩算法
              ext: '.gz', // 压缩后的文件名后缀
              threshold: 10240, // 只有大小大于该值的资源会被处理 10240B = 10KB
              deleteOriginFile: false // 压缩后是否删除原文件
            })
          ]
        : []),
      ...(devToolsModule ? [devToolsModule.default()] : []),
      // 创建 .nojekyll 文件，禁用 Jekyll 处理
      createNoJekyllPlugin(),
      ...(analyzerModule
        ? [
            analyzerModule.visualizer({
              filename: '.bundle-stats.html',
              open: false,
              gzipSize: true,
              brotliSize: true
            })
          ]
        : [])
      // 打包分析
      // visualizer({
      //   open: true,
      //   gzipSize: true,
      //   brotliSize: true,
      //   filename: 'dist/stats.html' // 分析图生成的文件名及路径
      // }),
    ],
    // 依赖预构建：避免运行时重复请求与转换，提升首次加载速度
    optimizeDeps: {
      // 只从真实应用入口发现依赖，避免扫描历史构建和预览 HTML。
      entries: ['index.html'],
      // Element Plus 的按需样式入口会导入 Sass 源码。让 Vite 直接按需处理它们，
      // 避免懒加载页面首次访问时触发依赖重优化和整页刷新。
      exclude: elementPlusStyleDeps,
      include: [
        ...hostedModuleSharedDependencies,
        'element-plus',
        'element-plus/es/locale/lang/en',
        'element-plus/es/locale/lang/zh-cn',
        'pinia-plugin-persistedstate',
        'vue-i18n',
        'mitt',
        'nprogress',
        'dayjs/plugin/utc',
        'dayjs/plugin/timezone',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        '@tresjs/core',
        'three',
        'xgplayer',
        'crypto-js',
        'file-saver',
        'vue-draggable-plus',
        'ohash',
        'vue-img-cutter',
        'element-plus/es',
        // 表格虚拟滚动入口由懒加载页面引入；提前预构建，避免运行时重优化使 Vue 依赖失效。
        'element-plus/es/components/table-v2/index.mjs',
        // 预构建 Monaco 主线程入口；?worker 由 Vite worker 管线独立编译。
        '@guolao/vue-monaco-editor',
        'sql-formatter',
        'monaco-editor/editor/editor.api',
        'monaco-editor/language/json/monaco.contribution',
        'monaco-sql-languages/esm/languages/pgsql/pgsql.js'
      ]
    },
    css: {
      // 限制 Sass 并发，给页面模块转换和并行子仓构建保留 CPU 与内存。
      preprocessorMaxWorkers: 4,
      preprocessorOptions: {
        // sass variable and mixin
        scss: {
          additionalData: withSharedScssGlobals
        }
      },
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') {
                  atRule.remove()
                }
              }
            }
          }
        ]
      }
    }
  })
}

function resolvePath(paths: string) {
  return path.resolve(configDirectory, paths)
}
