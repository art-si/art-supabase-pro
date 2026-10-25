import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const TCB =
  'C:/Users/EDY/AppData/Local/npm-cache/_npx/88bda5ef0319b729/node_modules/@cloudbase/cli/bin/tcb'
const ENVIRONMENT_ID = 'art-supabase-staging-d8a9e32316e'

const run = (command: string, args: string[], cwd: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, TCB_DISABLE_REPORT: '1' },
      stdio: 'inherit',
      windowsHide: true
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`CloudBase CLI exited with ${code}`))
    })
  })

async function main() {
  const workspace = process.cwd()
  const artifacts = path.join(workspace, '.artifacts/cloudbase')
  const credentials = JSON.parse(
    await readFile(path.join(artifacts, 'credentials.json'), 'utf8')
  ) as { publishableKey?: string; serverApiKey?: string }
  const sourceSecrets = JSON.parse(
    await readFile(path.join(artifacts, 'source-function-secrets.json'), 'utf8')
  ) as Record<string, string | null>
  if (!credentials.publishableKey || !credentials.serverApiKey) {
    throw new Error('CloudBase publishable and server API keys are required')
  }

  const sourceBinary = path.join(artifacts, 'edge-runtime/edge-runtime')
  const deployRoot = path.join(artifacts, 'edge-function-deploy')
  await rm(deployRoot, { recursive: true, force: true })
  await mkdir(deployRoot, { recursive: true })
  await copyFile(sourceBinary, path.join(deployRoot, 'edge-runtime'))
  await writeFile(path.join(deployRoot, 'scf_bootstrap'), '#!/bin/bash\nnode index.js\n', 'utf8')
  await writeFile(
    path.join(deployRoot, 'index.js'),
    `'use strict'
const http = require('node:http')
const { spawn } = require('node:child_process')
const child = spawn('/bin/bash', ['-lc', 'cp ./edge-runtime /tmp/edge-runtime && chmod +x /tmp/edge-runtime && exec /tmp/edge-runtime'], {
  cwd: __dirname,
  env: process.env,
  stdio: ['ignore', 'inherit', 'pipe']
})
let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
  stderr = (stderr + chunk).slice(-4000)
  process.stderr.write(chunk)
})
child.on('exit', (code) => {
  http.createServer((_request, response) => {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ code: 'edge_runtime_start_failed', exitCode: code, error: stderr }))
  }).listen(9000, '0.0.0.0')
})
`,
    'utf8'
  )

  const configPath = path.join(workspace, 'cloudbaserc.json')
  const config = {
    envId: ENVIRONMENT_ID,
    functionRoot: deployRoot.replace(/\\/gu, '/'),
    functions: [
      {
        name: 'art-supabase-edge',
        dir: deployRoot.replace(/\\/gu, '/'),
        type: 'HTTP',
        public: true,
        gatewayPath: '/edge-runtime',
        runtime: 'Nodejs20.19',
        timeout: 120,
        memorySize: 1024,
        installDependency: false,
        envVariables: {
          SUPABASE_URL: `https://${ENVIRONMENT_ID}.api.tcloudbasegateway.com`,
          CLOUDBASE_CLIENT_ID: ENVIRONMENT_ID,
          SUPABASE_ANON_KEY: credentials.publishableKey,
          SUPABASE_SERVICE_ROLE_KEY: credentials.serverApiKey,
          ...Object.fromEntries(
            Object.entries(sourceSecrets).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string' && entry[1].length > 0
            )
          )
        }
      }
    ]
  }

  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
    await run(
      process.execPath,
      [
        path.resolve(TCB),
        'fn',
        'deploy',
        'art-supabase-edge',
        '--httpFn',
        '--path',
        '/edge-runtime',
        '--install-dependency',
        'false',
        '--yes',
        '--json'
      ],
      workspace
    )
  } finally {
    await rm(configPath, { force: true })
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Edge runtime deployment failed'}\n`
  )
  process.exitCode = 1
})
