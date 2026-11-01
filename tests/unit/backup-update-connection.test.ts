import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { promises as dns } from 'node:dns'
import net, { type Socket } from 'node:net'
import test, { type TestContext } from 'node:test'
import * as tls from 'node:tls'
import postgres from 'postgres'
import {
  backupSourceTlsOptions,
  abortBackupSource,
  assertBackupSourceActive,
  backupSourceFailure,
  backupUpdateErrorCode,
  backupUpdateErrorMessage,
  connectBackupSource,
  timedBackupSource,
  withBackupSourceDeadline
} from '../../scripts/lib/backup-update-connection'

test('backup comparison trusts the official Supabase root while preserving TLS and hostname verification', () => {
  const ssl = backupSourceTlsOptions()
  const expected = new X509Certificate(
    readFileSync(new URL('../../scripts/lib/supabase-prod-ca-2021.crt', import.meta.url))
  )
  assert.equal(
    expected.fingerprint256.replaceAll(':', '').toLowerCase(),
    '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa'
  )
  assert.equal(expected.ca, true)
  assert.ok(expected.verify(expected.publicKey))
  assert.ok(Date.parse(expected.validTo) > Date.now())
  assert.equal(ssl.rejectUnauthorized, true)
  assert.equal(ssl.checkServerIdentity, undefined, 'Node must retain its standard hostname check')
  assert.equal(
    ssl.servername,
    undefined,
    'The actual connection hostname owns SNI and verification'
  )
  assert.ok(Array.isArray(ssl.ca))
  const certificates = ssl.ca as string[]
  assert.ok(
    certificates.some(
      (value) => new X509Certificate(value).fingerprint256 === expected.fingerprint256
    )
  )
  const defaults =
    typeof tls.getCACertificates === 'function'
      ? tls.getCACertificates('default')
      : tls.rootCertificates
  for (const certificate of defaults) assert.ok(certificates.includes(certificate))
})

// Public, test-only localhost TLS identity; never used by the backup client.
const fixtureTlsCertificate = `-----BEGIN CERTIFICATE-----
MIIDdDCCAlygAwIBAgIUAu+z9jqc21tKNf0f2nJHwtpQyFkwDQYJKoZIhvcNAQEL
BQAwLzEtMCsGA1UEAwwkYXdzLTEtYXAtc291dGgtMS5wb29sZXIuc3VwYWJhc2Uu
Y29tMCAXDTI2MTEwMTEyNDUxN1oYDzIxMjYxMDA4MTI0NTE3WjAvMS0wKwYDVQQD
DCRhd3MtMS1hcC1zb3V0aC0xLnBvb2xlci5zdXBhYmFzZS5jb20wggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCgdUD3Hq0mbuyreV0wkdVrg3ml2srO+Vil
EXz82yXph9ma8UnTU9018g96FfLRzPLJfJqYyDgoHbE+mAYzkuz8800UzBw2sat8
rNztt3Gu6K5LnzKDW0wo6FAtOmSost7GCIEpF2581+Hex3zeSd5P1BUP/KWY8xiD
rbDQyWdYHPmi1fU70QsRoeQbhOxpOCmsLkgpt+3VHdARczdpFulQSZkWvqnoLqJx
U2dgudvYmnabakzUz0vNkdB0ioUPiR+AA/sJSs8xqFXqN7d//FiQyxBpf26I/kBo
NBDIyimnE3nwax49Ak0tVPAN7xKialNRP6AtHw+y5qTRi2hu6TqBAgMBAAGjgYUw
gYIwHQYDVR0OBBYEFPgvZnCMQk3Kw9YxeyMJbneCjvYWMB8GA1UdIwQYMBaAFPgv
ZnCMQk3Kw9YxeyMJbneCjvYWMA8GA1UdEwEB/wQFMAMBAf8wLwYDVR0RBCgwJoIk
YXdzLTEtYXAtc291dGgtMS5wb29sZXIuc3VwYWJhc2UuY29tMA0GCSqGSIb3DQEB
CwUAA4IBAQBosLVwfMMythu6IKHpBUCLM7GfY0AiAcW+hMy2NECgBE+FqAU6pWNM
KgVxba28G/obbK10DlKCSvcbvyVhC4dYh5PSgH8NIvGFDxel2ZfouwRiLdFQimFq
gZ/ZHEO8Gt2fWOjA+06s3Yjw9FTvunSYDPUgKSRaJACO+ynXWbcKrxJGB3ggBJsu
9I2b8MngM7SwhdLGjIgsOKZX4+psiZY20icibmk06BXJHryffZpXwpWDpX1H/3KY
1HtMVxC/wXXMUDGkIBGK8LmNYbAZHBPAkJCD4Vgla1bMbgumP0bgrzRpZ3TCIHPO
Hzdddl7iD+wW+Ec2wGbH/HY1pW28a57w
-----END CERTIFICATE-----`
const fixtureTlsKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCgdUD3Hq0mbuyr
eV0wkdVrg3ml2srO+VilEXz82yXph9ma8UnTU9018g96FfLRzPLJfJqYyDgoHbE+
mAYzkuz8800UzBw2sat8rNztt3Gu6K5LnzKDW0wo6FAtOmSost7GCIEpF2581+He
x3zeSd5P1BUP/KWY8xiDrbDQyWdYHPmi1fU70QsRoeQbhOxpOCmsLkgpt+3VHdAR
czdpFulQSZkWvqnoLqJxU2dgudvYmnabakzUz0vNkdB0ioUPiR+AA/sJSs8xqFXq
N7d//FiQyxBpf26I/kBoNBDIyimnE3nwax49Ak0tVPAN7xKialNRP6AtHw+y5qTR
i2hu6TqBAgMBAAECggEAA6yjs/T9IJHuNAAHuQbB5SAh30ErH0G4/LCxlMW88MPW
YRSw7NixClz0a0aI5LKFhcUnciO1m3+QkT8gdzpgWGuG4pjI9ZyscWKw/XWTsh5s
bVlkKftje1VUjrCVYQKVlOHZeVQqyMuVxcj6LEnzQA86ez79GMtKTquhzqoqBmu8
GdDCfP4kbcASs7sMurigDru5JEmMtNIpygriCyvRFLVzJZ6loMFyvhYzrZKQvnJ8
qhQNelDDAEwWFnQq3+WAm6O3RgReHj/BOIV02dLo7ahmTCdN5smW7JOjOCUfbFba
y09cgA6EKfWELH66jg5F2jwvYA6X+M5t8nCbYHZAUQKBgQDibPjSaVYjpuzELjdV
dn9K4P7bRVkkMVrFlpLTvX4z6q7XWCwQqJoMk6uWQwxZMo8izGSSxTGslc3ufj6U
0lJx5epkYG/Q7v+PwO84GXhZYsr9i125MyrxYZ7shIxyV5FpDCECmPWyaoL7RO8X
S0od0uGQH/KvR/U0f/wo0tRpyQKBgQC1aoMPVTVc4WOjOQp5Ae2+4F/vNuYlItMZ
dL+1U6+GA3jrx+eMbcCYgP8m6gkO/gZcijLLGVcz/1SZEwno+n6evLcin+A3LAlJ
HuPgXuxDqBSi6iPqoFQPwRpQsoyDVRcA3yVAiwN7wxaB2qELdFMZuurb2ttuS2cC
6bV9bwam+QKBgFuA+GloImSUD/kUSE5kbfrfxH7unqCuxWU2fa3OVZM7k175hg1R
ZbgRcXVvMS1W7lt8yGQ8BuAdRjTMlhPkj2byKHBaPLXt8B+zM7mzKVzOPQSL7ttq
Xz9fWS9yPaPz2ZLfUPPQxvJMcxSCfjEmvxQgZgGtt5C4ftKxqkEBOtBpAoGBAJY2
qGh0vGe4tKC9JV/G6g2niafwRCYxrKuiUO6aaXbEv0Yz0xUi91sPTLXzCSchzTCo
uaATznHelDTfX9BKQbe8OMNxr9zfGJ0z96mbz3PB47x1tOGceZ5F3T0+ajyAozh0
jEriEDNU+Pjyh3CNlBV1AOykThcIVjZCP6Wp3c85AoGASSNVIDrUnjsZOn3mUP2q
yIgD1MQ0FY9vuEcmn9gasqrTjdvz2xcoQ2jtzXnSO/QDVI40dAJTGoAduFlYwp6a
GVoF0ZAMqsUjPNK9RNRpHjL2JR7jB6Vu5ZagYggrnaNLQnVuTGaJfHTymTiNIswC
QqKyjrk7ug7zNVI1vqjolw4=
-----END PRIVATE KEY-----`

const source = {
  Host: 'aws-1-ap-south-1.pooler.supabase.com',
  Port: 5432,
  User: 'postgres.ckbftoopuyophiebamwy',
  Database: 'postgres'
}
const addresses = [
  { address: '192.0.2.10', family: 4 },
  { address: '192.0.2.20', family: 4 },
  { address: '192.0.2.30', family: 4 }
]
const connectionFailure = (code: string) =>
  Object.assign(new Error('fixture transport failure'), { code })

function sourceClient(t: TestContext, failure?: Error) {
  // postgres is lazy; intercept every query so these tests never open a socket.
  const client = postgres({ host: '127.0.0.1', port: 1, ssl: false, max: 1 })
  const query = t.mock.method(client, 'unsafe', async (sql: string) => {
    assert.equal(sql, 'select 1')
    if (failure) throw failure
    return []
  })
  const end = t.mock.method(client, 'end', async () => {})
  return { client, query, end }
}

test('source connection rejects another project and transaction poolers before DNS or opening a socket', async (t) => {
  t.mock.method(dns, 'lookup', () => assert.fail('invalid configuration must not resolve DNS'))
  await assert.rejects(
    () => connectBackupSource({ ...source, User: 'postgres.anotherproject' }, 'test-secret'),
    /来源连接不属于本项目/
  )
  await assert.rejects(() => connectBackupSource({ ...source, Port: 6543 }, 'test-secret'), /5432/)
})

test('a failed connection is closed before switching pooler addresses while retaining TLS identity', async (t) => {
  const lookup = t.mock.method(dns, 'lookup', async () => addresses)
  const failed = sourceClient(t, connectionFailure('CONNECT_TIMEOUT'))
  const ready = sourceClient(t)
  const options: postgres.Options<Record<string, never>>[] = []
  const retries: Array<[number, number, string]> = []
  const result = await connectBackupSource(
    source,
    'fixture-password',
    (...retry) => retries.push(retry),
    (value) => {
      options.push(value)
      if (options.length === 1) return failed.client
      assert.equal(failed.end.mock.callCount(), 1, 'failed client must close before retry')
      return ready.client
    }
  )
  assert.equal(result, ready.client)
  assert.equal(lookup.mock.callCount(), 1)
  assert.equal(failed.query.mock.callCount(), 1)
  assert.equal(ready.query.mock.callCount(), 1, 'authenticate before starting snapshot work')
  assert.equal(ready.end.mock.callCount(), 0, 'caller owns the authenticated client')
  assert.deepEqual(
    options.map((value) => value.host),
    addresses.slice(0, 2).map((value) => value.address)
  )
  assert.deepEqual(retries, [[2, 3, 'CONNECT_TIMEOUT']])
  for (const value of options) {
    assert.equal(value.port, 5432)
    assert.equal(value.username, source.User)
    assert.equal(value.password, 'fixture-password')
    assert.equal(value.connect_timeout, 30)
    assert.equal(value.prepare, false)
    assert.equal(typeof value.ssl, 'object')
    assert.ok(value.ssl && typeof value.ssl === 'object')
    assert.ok('servername' in value.ssl)
    assert.ok('rejectUnauthorized' in value.ssl)
    assert.equal(value.ssl.servername, source.Host)
    assert.equal(value.ssl.rejectUnauthorized, true)
    assert.equal('checkServerIdentity' in value.ssl, false)
  }
})

test('transport retries stop after three attempts and close every failed client', async (t) => {
  t.mock.method(dns, 'lookup', async () => addresses)
  const failures = ['CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].map(connectionFailure)
  const clients = failures.map((failure) => sourceClient(t, failure))
  const hosts: unknown[] = []
  const retries: Array<[number, number, string]> = []
  await assert.rejects(
    connectBackupSource(
      source,
      'fixture-password',
      (...retry) => retries.push(retry),
      (value) => {
        hosts.push(value.host)
        return clients[hosts.length - 1].client
      }
    ),
    (cause: unknown) => cause === failures[2]
  )
  assert.deepEqual(
    hosts,
    addresses.map((value) => value.address)
  )
  assert.deepEqual(retries, [
    [2, 3, 'CONNECT_TIMEOUT'],
    [3, 3, 'ECONNRESET']
  ])
  for (const { end, query } of clients) {
    assert.equal(query.mock.callCount(), 1)
    assert.equal(end.mock.callCount(), 1)
    assert.deepEqual(end.mock.calls[0].arguments, [{ timeout: 0 }])
  }
})

test('authentication, TLS validation, and SQL failures stop immediately', async (t) => {
  t.mock.method(dns, 'lookup', async () => addresses)
  for (const code of [
    '28P01',
    'SASL_SIGNATURE_MISMATCH',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'SELF_SIGNED_CERT_IN_CHAIN',
    '42501',
    '57014'
  ]) {
    const failure = connectionFailure(code)
    const { client, query, end } = sourceClient(t, failure)
    let created = 0
    await assert.rejects(
      connectBackupSource(
        source,
        'fixture-password',
        () => assert.fail(`${code} must not retry`),
        () => {
          created++
          return client
        }
      ),
      (cause: unknown) => cause === failure
    )
    assert.equal(created, 1, code)
    assert.equal(query.mock.callCount(), 1, code)
    assert.equal(end.mock.callCount(), 1, code)
  }
})

test('a temporary DNS failure is retried before creating a client', async (t) => {
  let lookups = 0
  t.mock.method(dns, 'lookup', async () => {
    if (++lookups === 1) throw connectionFailure('EAI_AGAIN')
    return addresses.slice(0, 2)
  })
  const { client, query, end } = sourceClient(t)
  const retries: Array<[number, number, string]> = []
  let created = 0
  assert.equal(
    await connectBackupSource(
      source,
      'fixture-password',
      (...retry) => retries.push(retry),
      (options) => {
        assert.equal(lookups, 2)
        assert.equal(options.host, addresses[0].address, 'DNS retry must not skip a pooler address')
        created++
        return client
      }
    ),
    client
  )
  assert.equal(created, 1)
  assert.equal(query.mock.callCount(), 1)
  assert.equal(end.mock.callCount(), 0)
  assert.deepEqual(retries, [[2, 3, 'EAI_AGAIN']])
})

test(
  'DNS waits have a total connection deadline and never create a client after expiry',
  { timeout: 5000 },
  async (t) => {
    t.mock.method(dns, 'lookup', () => new Promise<never>(() => {}))
    const retries: Array<[number, number, string]> = []
    await assert.rejects(
      connectBackupSource(
        source,
        'fixture-password',
        (...retry) => retries.push(retry),
        () => assert.fail('DNS timeout must not create a client'),
        20
      ),
      (cause: unknown) => backupUpdateErrorCode(cause) === 'BACKUP_SOURCE_CONNECT_TIMEOUT'
    )
    assert.deepEqual(retries, [
      [2, 3, 'BACKUP_SOURCE_CONNECT_TIMEOUT'],
      [3, 3, 'BACKUP_SOURCE_CONNECT_TIMEOUT']
    ])
  }
)

test('read deadlines fence later queries and preserve their first error through teardown', async (t) => {
  const { client, query, end } = sourceClient(t)
  const read = withBackupSourceDeadline(client, new Promise<never>(() => {}), 20)
  await assert.rejects(
    read,
    (cause: unknown) => backupUpdateErrorCode(cause) === 'BACKUP_SOURCE_READ_TIMEOUT'
  )
  const failure = backupSourceFailure(client)
  assert.ok(failure)
  assert.throws(
    () => assertBackupSourceActive(client),
    (cause: unknown) => cause === failure
  )
  assert.throws(
    () => timedBackupSource(client, client).unsafe('select 1'),
    (cause: unknown) => cause === failure
  )
  await abortBackupSource(client, connectionFailure('CONNECTION_CLOSED'))
  assert.equal(backupSourceFailure(client), failure)
  assert.equal(query.mock.callCount(), 0, 'expired clients must not schedule later SQL')
  assert.equal(end.mock.callCount(), 1, 'teardown is shared by deadline and outer failure cleanup')
})

async function stalledPostgres(
  t: TestContext,
  options: { completePreflight?: boolean; encrypted?: boolean; rejectAuth?: boolean } = {}
) {
  const sockets = new Set<Socket>()
  const closed: Promise<void>[] = []
  const received: string[] = []
  let requests = 0
  const ready = Buffer.from([90, 0, 0, 0, 5, 73])
  const server = net.createServer((socket) => {
    sockets.add(socket)
    closed.push(
      new Promise<void>((resolve) =>
        socket.once('close', () => {
          sockets.delete(socket)
          resolve()
        })
      )
    )
    socket.on('error', () => {})
    const serve = (transport: Socket) => {
      let startup = true
      let preflight = options.completePreflight
      transport.on('error', () => {})
      transport.on('data', (data) => {
        if (startup) {
          startup = false
          if (options.rejectAuth) {
            const body = Buffer.from('SFATAL\0C28P01\0Mfixture password rejected\0\0')
            const header = Buffer.alloc(5)
            header[0] = 69
            header.writeUInt32BE(body.length + 4, 1)
            transport.write(Buffer.concat([header, body]))
            return
          }
          // AuthenticationOk followed by ReadyForQuery cancels the driver's
          // connect_timeout. Subsequent silence reproduces the real failure.
          transport.write(Buffer.concat([Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0]), ready]))
        } else {
          received.push(data.toString('utf8'))
          requests++
          if (preflight) {
            preflight = false
            const body = Buffer.from('SELECT 1\0')
            const header = Buffer.alloc(5)
            header[0] = 67
            header.writeUInt32BE(body.length + 4, 1)
            transport.write(Buffer.concat([header, body, ready]))
          }
        }
      })
    }
    if (options.encrypted) {
      socket.once('data', (request) => {
        assert.equal(request.toString('hex'), '0000000804d2162f')
        socket.write(Buffer.from('S'))
        const secure = new tls.TLSSocket(socket, {
          isServer: true,
          secureContext: tls.createSecureContext({
            cert: fixtureTlsCertificate,
            key: fixtureTlsKey
          })
        })
        serve(secure)
      })
    } else serve(socket)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => (cause ? reject(cause) : resolve()))
    )
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const originalConnect = net.connect
  t.mock.method(net, 'connect', () => originalConnect({ host: '127.0.0.1', port: address.port }))
  t.mock.method(dns, 'lookup', async () => addresses)
  return { closed, sockets, received, requests: () => requests }
}

test(
  'real PostgreSQL client retries and closes sockets when auth succeeds but preflight is silent',
  { timeout: 5000 },
  async (t) => {
    const server = await stalledPostgres(t)
    let created = 0
    await assert.rejects(
      connectBackupSource(
        source,
        'fixture-password',
        undefined,
        (options) => {
          created++
          return postgres({ ...options, ssl: false })
        },
        100
      ),
      (cause: unknown) => backupUpdateErrorCode(cause) === 'BACKUP_SOURCE_CONNECT_TIMEOUT'
    )
    assert.equal(created, 3)
    assert.equal(server.requests(), 3, 'each connection reached post-authentication work')
    await Promise.all(server.closed)
    assert.equal(server.sockets.size, 0, 'deadline must close the actual TCP transports')
  }
)

test(
  'real read timeout closes the authenticated transport and stops subsequent queries',
  { timeout: 5000 },
  async (t) => {
    const server = await stalledPostgres(t, { completePreflight: true })
    const client = await connectBackupSource(
      source,
      'fixture-password',
      undefined,
      (options) => {
        const fixtureOptions = { ...options, ssl: false, fetch_types: false }
        return postgres(fixtureOptions)
      },
      1000
    )
    assert.equal(server.requests(), 1, JSON.stringify(server.received))
    await assert.rejects(
      withBackupSourceDeadline(client, client.unsafe('select pg_sleep(60)'), 30),
      (cause: unknown) => backupUpdateErrorCode(cause) === 'BACKUP_SOURCE_READ_TIMEOUT'
    )
    assert.equal(server.requests(), 2)
    await Promise.all(server.closed)
    assert.equal(server.sockets.size, 0)
    assert.throws(() => timedBackupSource(client, client).unsafe('select 1'), /响应超时/)
    assert.equal(server.requests(), 2)
  }
)

test(
  'encrypted PostgreSQL authentication failure closes cleanly without a Terminate write race',
  { timeout: 5000 },
  async (t) => {
    const server = await stalledPostgres(t, { encrypted: true, rejectAuth: true })
    await assert.rejects(
      connectBackupSource(
        source,
        'fixture-password',
        () => assert.fail('authentication must not retry'),
        (options) =>
          postgres({
            ...options,
            ssl: {
              ...backupSourceTlsOptions(),
              ca: [fixtureTlsCertificate],
              servername: source.Host
            }
          }),
        1000
      ),
      (cause: unknown) => backupUpdateErrorCode(cause) === '28P01'
    )
    await Promise.all(server.closed)
    assert.equal(server.sockets.size, 0)
  }
)

test(
  'encrypted PostgreSQL preflight deadlines close TLS before pool teardown and retry safely',
  { timeout: 5000 },
  async (t) => {
    const server = await stalledPostgres(t, { encrypted: true })
    let created = 0
    await assert.rejects(
      connectBackupSource(
        source,
        'fixture-password',
        undefined,
        (options) => {
          created++
          return postgres({
            ...options,
            ssl: {
              ...backupSourceTlsOptions(),
              ca: [fixtureTlsCertificate],
              servername: source.Host
            }
          })
        },
        200
      ),
      (cause: unknown) => backupUpdateErrorCode(cause) === 'BACKUP_SOURCE_CONNECT_TIMEOUT'
    )
    assert.equal(created, 3)
    assert.equal(server.requests(), 3)
    await Promise.all(server.closed)
    assert.equal(server.sockets.size, 0)
  }
)

test('backup failure messages distinguish credentials, TLS, and reachability without exposing secrets', () => {
  const secret = 'private-test-password'
  const failure = (code: string) =>
    Object.assign(new Error(`postgres://postgres:${secret}@private-host/db`), { code })
  assert.match(backupUpdateErrorMessage(failure('28P01')), /身份验证.*来源数据库密码/)
  assert.match(backupUpdateErrorMessage(failure('SASL_SIGNATURE_MISMATCH')), /身份验证/)
  assert.match(backupUpdateErrorMessage(failure('SELF_SIGNED_CERT_IN_CHAIN')), /安全证书/)
  assert.match(backupUpdateErrorMessage(failure('ERR_TLS_CERT_ALTNAME_INVALID')), /安全证书/)
  assert.match(backupUpdateErrorMessage(failure('ETIMEDOUT')), /网络.*5432/)
  assert.match(backupUpdateErrorMessage(failure('ENOTFOUND')), /DNS/)
  assert.match(backupUpdateErrorMessage(failure('57014')), /读取超时/)
  assert.match(backupUpdateErrorMessage(failure('BACKUP_SOURCE_CONNECT_TIMEOUT')), /无法连接/)
  assert.match(backupUpdateErrorMessage(failure('BACKUP_SOURCE_READ_TIMEOUT')), /读取超时/)
  assert.match(backupUpdateErrorMessage(failure('CONNECTION_CLOSED')), /读取期间中断/)
  assert.match(backupUpdateErrorMessage(failure('BACKUP_COPY_FORMAT')), /本地备份数据格式/)
  for (const code of ['28P01', 'SELF_SIGNED_CERT_IN_CHAIN', 'ETIMEDOUT', 'unknown']) {
    assert.doesNotMatch(
      backupUpdateErrorMessage(failure(code)),
      /private-test-password|private-host|postgres:\/\//
    )
  }
  assert.equal(backupUpdateErrorMessage(new Error('本地备份校验未通过。')), '本地备份校验未通过。')
  assert.doesNotMatch(
    backupUpdateErrorMessage(new Error(`密码 password=${secret} 未通过`)),
    /private-test-password/
  )
  assert.match(backupUpdateErrorMessage(null), /读取失败/)
  assert.equal(backupUpdateErrorCode(failure('57014')), '57014')
  assert.equal(backupUpdateErrorCode(failure('BACKUP_COPY_FORMAT')), 'BACKUP_COPY_FORMAT')
  assert.equal(backupUpdateErrorCode(failure(secret)), 'BACKUP_UPDATE_FAILED')
  assert.equal(backupUpdateErrorCode(null), 'BACKUP_UPDATE_FAILED')
  const privateValue = '中文-private-value'
  const providerError = Object.assign(
    new Error(
      `invalid input syntax for type integer: "${privateValue}"; SELECT private_column FROM private_table`
    ),
    { code: '22P02' }
  )
  assert.doesNotMatch(
    backupUpdateErrorMessage(providerError),
    /中文-private-value|SELECT|private_column|private_table/
  )
  const providerWithoutCode = Object.assign(new Error(`来源中文数据: ${privateValue}`), {
    name: 'PostgresError'
  })
  assert.doesNotMatch(backupUpdateErrorMessage(providerWithoutCode), /中文-private-value/)
  assert.equal(backupUpdateErrorCode(providerError), '22P02')
})
