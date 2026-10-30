import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { userInfo } from 'node:os'
import path from 'node:path'
import type { SqlConnection, SqlConnectionInput } from '../src/types/sql-connections'
import { isSqlConnection } from '../src/utils/sql-connections'

interface StoredConnection {
  connection: SqlConnection
  secret: string
}

/** Only the gateway owns this file. Neither passwords nor encryption keys enter browser storage. */
export class SqlConnectionVault {
  private readonly key: Buffer
  private readonly file: string
  private records: StoredConnection[]
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (process.platform === 'win32')
      execFileSync(
        'icacls.exe',
        [directory, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`],
        { windowsHide: true, stdio: 'ignore' }
      )
    const keyFile = path.join(directory, 'vault.key')
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 })
    this.key = readFileSync(keyFile)
    if (this.key.length !== 32) throw new Error('连接密钥损坏，请恢复执行端备份后重试')
    this.file = path.join(directory, 'connections.json')
    const saved: unknown = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : []
    if (!Array.isArray(saved)) throw new Error('连接配置损坏，请恢复执行端备份后重试')
    this.records = saved.map((value: unknown) => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('connection' in value) ||
        !('secret' in value) ||
        !isSqlConnection(value.connection) ||
        typeof value.secret !== 'string'
      )
        throw new Error('连接配置损坏，请恢复执行端备份后重试')
      return { connection: value.connection, secret: value.secret }
    })
  }
  list(): SqlConnection[] {
    return this.records.map((record) => structuredClone(record.connection))
  }
  get(id: string): { connection: SqlConnection; password: string } {
    const record = this.records.find((record) => record.connection.id === id)
    if (!record) throw new Error('连接不存在，请刷新连接列表')
    const [iv, tag, data] = record.secret.split('.')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return {
      connection: structuredClone(record.connection),
      password: Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final()
      ]).toString('utf8')
    }
  }
  save(input: SqlConnectionInput): SqlConnection {
    const previous = input.id ? this.get(input.id) : undefined
    if (previous && previous.connection.tenantId !== input.tenantId)
      throw new Error('已保存连接不能更换所属租户，请新建连接')
    const { password: supplied, id, ...fields } = input
    const password =
      supplied === undefined || (previous && supplied === '') ? previous?.password : supplied
    if (password === undefined) throw new Error('请填写数据库密码')
    const connection: SqlConnection = {
      ...fields,
      id: id || randomUUID(),
      updatedAt: new Date().toISOString()
    }
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    const secret = [iv, cipher.getAuthTag(), encrypted]
      .map((buffer) => buffer.toString('base64'))
      .join('.')
    const next = [
      ...this.records.filter((record) => record.connection.id !== connection.id),
      { connection, secret }
    ]
    const temporary = `${this.file}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 })
    renameSync(temporary, this.file)
    this.records = next
    return connection
  }
}
