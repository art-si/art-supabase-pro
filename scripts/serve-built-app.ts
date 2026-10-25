import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, relative, resolve } from 'node:path'
import {
  extractBuildBase,
  isAssetPath,
  isPathWithinRoot,
  stripBuildBase
} from './serve-built-app-model'

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
}

function readArgument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

function sendStatus(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(message)
}

const host = readArgument('--host', '127.0.0.1')
const port = Number(readArgument('--port', '41737'))
const outputDirectory = resolve(process.cwd(), process.env.VITE_OUT_DIR || 'docs')
const indexFile = resolve(outputDirectory, 'index.html')

if (!existsSync(indexFile)) {
  throw new Error(`未找到构建产物 ${indexFile}，请先运行 pnpm build`)
}

const buildBase = extractBuildBase(readFileSync(indexFile, 'utf8'))

const server = createServer((request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || host}`)
    const pathname = stripBuildBase(decodeURIComponent(requestUrl.pathname), buildBase)
    let filePath = resolve(outputDirectory, `.${pathname}`)

    if (!isPathWithinRoot(outputDirectory, filePath)) {
      sendStatus(response, 403, 'Forbidden')
      return
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = resolve(filePath, 'index.html')
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      if (
        isAssetPath(relative(outputDirectory, filePath)) ||
        Object.hasOwn(MIME_TYPES, extname(filePath).toLowerCase())
      ) {
        sendStatus(response, 404, 'Not Found')
        return
      }
      filePath = indexFile
    }

    const extension = extname(filePath).toLowerCase()
    const isAsset = isAssetPath(relative(outputDirectory, filePath))
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    const stream = createReadStream(filePath)
    stream.once('error', () => {
      if (!response.headersSent) sendStatus(response, 500, 'Internal Server Error')
      else response.destroy()
    })
    stream.pipe(response)
  } catch {
    sendStatus(response, 400, 'Bad Request')
  }
})

server.once('error', (error) => {
  console.error(`[serve] 启动失败：${error.message}`)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`[serve] ${outputDirectory} (${buildBase}) -> http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
