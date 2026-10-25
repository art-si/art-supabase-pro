import fs from 'node:fs'

export function readDemoCredentials(): { email: string; password: string } {
  const loginSource = fs.readFileSync('src/views/auth/login/index.vue', 'utf8')
  const email =
    process.env.E2E_EMAIL ||
    loginSource.match(/identifier:\s*rememberedIdentifier \|\| '([^']+)'/)?.[1]
  const password = process.env.E2E_PASSWORD || loginSource.match(/password:\s*'([^']+)'/)?.[1]

  if (!email || !password) {
    throw new Error('请通过 E2E_EMAIL 和 E2E_PASSWORD 提供端到端测试账号')
  }
  return { email, password }
}
