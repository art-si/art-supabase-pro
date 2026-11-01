import { uniqBy } from 'lodash-es'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '@/types/sql-query-api'
import { getOwnRecordValue, isObjectRecord } from '@/utils/record'
import { isSqlQueryApiParameterType, sqlQueryApiExampleValues } from './query-api-ui'

export class SqlQueryApiOpenApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SqlQueryApiOpenApiError'
  }
}

export interface SqlQueryApiOpenApiSchema {
  $ref?: string
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  description?: string
  const?: string | number
  properties?: Record<string, SqlQueryApiOpenApiSchema>
  required?: string[]
  additionalProperties?: boolean | SqlQueryApiOpenApiSchema
  items?: SqlQueryApiOpenApiSchema
  anyOf?: SqlQueryApiOpenApiSchema[]
  oneOf?: SqlQueryApiOpenApiSchema[]
  format?: string
  pattern?: string
  minimum?: number
  maximum?: number
  maxLength?: number
  maxItems?: number
  examples?: (string | boolean)[]
  'x-max-utf16-length'?: number
}

interface OpenApiResponse {
  description: string
  content: Record<string, { schema: SqlQueryApiOpenApiSchema }>
}

export interface SqlQueryApiOpenApiDocument {
  openapi: '3.1.0'
  info: { title: string; version: '1.0.0'; description: string }
  servers: { url: string }[]
  security: { BearerAuth: []; ProjectApiKey: [] }[]
  paths: Record<
    string,
    {
      post: {
        operationId: string
        summary: string
        description: string
        requestBody: {
          required: true
          content: {
            'application/json': {
              schema: SqlQueryApiOpenApiSchema
              example: { params: Record<string, string | boolean> }
            }
          }
        }
        responses: Record<string, OpenApiResponse>
      }
    }
  >
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http'; scheme: 'bearer'; bearerFormat: 'JWT'; description: string }
      ProjectApiKey: { type: 'apiKey'; in: 'header'; name: 'apikey'; description: string }
    }
    schemas: Record<string, SqlQueryApiOpenApiSchema>
  }
  'x-query-api-enabled': boolean
  'x-query-api-max-rows': number
  'x-query-api-timeout-ms': number
}

interface PublicDefinition {
  slug: string
  name: string
  description: string
  parameters: SqlQueryApiParameter[]
  maxRows: number
  timeoutMs: number
  enabled: boolean
}

const slugPattern = /^[a-z][a-z\d-]{2,63}$/
const parameterName = /^[A-Za-z_][A-Za-z\d_]{0,39}$/
const uuidPattern = '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
const decimalPattern = '^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d{1,3})?$'
const datePattern = '^(?!0000)\\d{4}-\\d{2}-\\d{2}$'
const invalidDefinition = (): never => {
  throw new SqlQueryApiOpenApiError('查询 API 的公开配置无效，请刷新列表后重试')
}

function readParameters(value: unknown): SqlQueryApiParameter[] {
  if (!Array.isArray(value)) return invalidDefinition()
  const length = getOwnRecordValue(value, 'length')
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > 20)
    return invalidDefinition()
  const parameters: SqlQueryApiParameter[] = []
  for (let index = 0; index < length; index++) {
    const parameter = getOwnRecordValue(value, String(index))
    if (!isObjectRecord(parameter)) return invalidDefinition()
    const name = getOwnRecordValue(parameter, 'name')
    const type = getOwnRecordValue(parameter, 'type')
    const required = getOwnRecordValue(parameter, 'required')
    if (
      typeof name !== 'string' ||
      !parameterName.test(name) ||
      !isSqlQueryApiParameterType(type) ||
      typeof required !== 'boolean'
    )
      return invalidDefinition()
    parameters.push({ name, type, required })
  }
  if (uniqBy(parameters, 'name').length !== parameters.length) return invalidDefinition()
  return parameters
}

function readPublicDefinition(definition: SqlQueryApiDefinition): PublicDefinition {
  if (!isObjectRecord(definition)) return invalidDefinition()
  // Never enumerate/spread the definition: private getters and payloads remain untouched.
  const slug = getOwnRecordValue(definition, 'slug')
  const name = getOwnRecordValue(definition, 'name')
  const description = getOwnRecordValue(definition, 'description')
  const maxRows = getOwnRecordValue(definition, 'maxRows')
  const timeoutMs = getOwnRecordValue(definition, 'timeoutMs')
  const enabled = getOwnRecordValue(definition, 'enabled')
  if (
    typeof slug !== 'string' ||
    !slugPattern.test(slug) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    typeof description !== 'string' ||
    description.length > 500 ||
    typeof maxRows !== 'number' ||
    !Number.isInteger(maxRows) ||
    maxRows < 1 ||
    maxRows > 1000 ||
    typeof timeoutMs !== 'number' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 30000 ||
    typeof enabled !== 'boolean'
  )
    return invalidDefinition()
  return {
    slug,
    name,
    description,
    maxRows,
    timeoutMs,
    enabled,
    parameters: readParameters(getOwnRecordValue(definition, 'parameters'))
  }
}

function endpointUrl(raw: string, slug: string): URL {
  const invalid = (): never => {
    throw new SqlQueryApiOpenApiError('查询 API 地址无效，请刷新列表后重试导出')
  }
  if (
    typeof raw !== 'string' ||
    raw.length > 2048 ||
    raw.trim() !== raw ||
    /[\s\\%{}?#@]/.test(raw) ||
    /\/\.{1,2}(?:\/|$)/.test(raw)
  )
    return invalid()
  let url: URL
  try {
    url = new URL(raw)
  } catch (cause) {
    throw new SqlQueryApiOpenApiError('查询 API 地址无效，请刷新列表后重试导出', { cause })
  }
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(?:[A-Za-z0-9._~-]+\/)*sql-query-api\/[a-z][a-z\d-]{2,63}$/.test(url.pathname) ||
    !url.pathname.endsWith(`/sql-query-api/${slug}`)
  )
    return invalid()
  return url
}

function valueSchema(parameter: SqlQueryApiParameter): SqlQueryApiOpenApiSchema {
  let schema: SqlQueryApiOpenApiSchema
  switch (parameter.type) {
    case 'number':
      schema = {
        description:
          '推荐使用十进制字符串保留精度；指数部分最多 3 位数字。JSON 数值的绝对值不得超过 9007199254740991，小数也受同一幅度限制。',
        anyOf: [
          {
            type: 'string',
            pattern: decimalPattern,
            maxLength: 128,
            examples: ['100.50', '12345678901234567890.1234567890123456789']
          },
          { type: 'number', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }
        ]
      }
      break
    case 'string':
      schema = {
        type: 'string',
        'x-max-utf16-length': 10000,
        description:
          '最多 10000 个 UTF-16 编码单元（通常汉字计 1、emoji 计 2）；保留空白与空字符串。此限制不等同于 JSON Schema maxLength 的 Unicode 字符数。'
      }
      break
    case 'boolean':
      schema = { type: 'boolean', examples: [true, false] }
      break
    case 'date':
      schema = {
        type: 'string',
        format: 'date',
        pattern: datePattern,
        description: '真实日历日期，格式 YYYY-MM-DD，年份为 0001–9999，不接受时间或外层空白。',
        examples: ['2026-01-01']
      }
      break
    case 'uuid':
      schema = { type: 'string', format: 'uuid', pattern: uuidPattern }
      break
  }
  return parameter.required
    ? schema
    : {
        anyOf: [schema, { type: 'null' }],
        description: '可省略或显式传入 null，均绑定为 SQL NULL。'
      }
}

function responseSchemas(maxRows: number): Record<string, SqlQueryApiOpenApiSchema> {
  return {
    QueryApiSuccess: {
      type: 'object',
      additionalProperties: false,
      required: [
        'status',
        'rows',
        'columns',
        'rowCount',
        'truncated',
        'durationMs',
        'maxRows',
        'timeoutMs'
      ],
      properties: {
        status: { type: 'string', const: 'ok' },
        rows: {
          type: 'array',
          maxItems: maxRows,
          items: { type: 'object', additionalProperties: true },
          description: '字段由已发布查询决定；此规范不读取结果或推断字段类型。'
        },
        columns: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
            additionalProperties: false
          }
        },
        rowCount: { type: 'integer', minimum: 0, maximum: maxRows },
        truncated: { type: 'boolean' },
        durationMs: { type: 'integer', minimum: 0 },
        maxRows: { type: 'integer', minimum: 1, maximum: 1000 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 }
      }
    },
    QueryApiCancelled: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'message', 'durationMs'],
      properties: {
        status: { type: 'string', const: 'cancelled' },
        message: { type: 'string' },
        durationMs: { type: 'integer', minimum: 0 }
      }
    },
    QueryApiError: {
      type: 'object',
      required: ['status', 'code', 'message'],
      additionalProperties: true,
      properties: {
        status: { type: 'string', const: 'error' },
        code: { type: 'string' },
        message: { type: 'string' }
      }
    },
    GatewayError: {
      type: 'object',
      required: ['message'],
      additionalProperties: true,
      properties: {
        code: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        message: { type: 'string' }
      }
    }
  }
}

/** A public contract snapshot, with fixed examples and no SQL, private identity or live session reads. */
export function buildSqlQueryApiOpenApi(
  definition: SqlQueryApiDefinition,
  url: string
): SqlQueryApiOpenApiDocument {
  const value = readPublicDefinition(definition)
  const endpoint = endpointUrl(url, value.slug)
  const required = value.parameters
    .filter((parameter) => parameter.required)
    .map(({ name }) => name)
  // The canonical example helper also recognizes demos via SQL. Pass an explicit public DTO
  // with empty private fields so it cannot inspect the original definition's SQL or identity.
  const examples = sqlQueryApiExampleValues({
    ...value,
    id: '',
    sql: '',
    tenantId: '',
    allowedUserIds: [],
    updatedAt: ''
  })
  const error: OpenApiResponse = {
    description:
      'API 或网关错误。先检查 HTTP 状态与 Content-Type；网关错误不保证使用 API 的 status/code/message 格式，也可能返回非 JSON 正文。',
    content: {
      'application/json': {
        schema: {
          anyOf: [
            { $ref: '#/components/schemas/QueryApiError' },
            { $ref: '#/components/schemas/GatewayError' }
          ]
        }
      },
      'text/plain': { schema: { type: 'string' } }
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: value.name,
      version: '1.0.0',
      description: `${value.description}${value.description ? '\n\n' : ''}固定只读查询；每次调用仍校验账号授权与所属租户。本文件只描述业务调用，不包含管理或取消控制面操作。`
    },
    servers: [{ url: endpoint.origin }],
    security: [{ BearerAuth: [], ProjectApiKey: [] }],
    paths: {
      [endpoint.pathname]: {
        post: {
          operationId: `invoke_${value.slug.replaceAll('-', '_')}`,
          summary: value.name,
          description: `${value.enabled ? '' : '当前已停用，启用前调用会被拒绝。'}最多返回 ${value.maxRows} 行，查询时限 ${value.timeoutMs / 1000} 秒。HTTP 200 的 status 可能为 ok 或 cancelled，只有原调用返回 cancelled 才确认查询已停止。接口停用或授权变化时仍可能拒绝调用。`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  ...(required.length ? { required: ['params'] } : {}),
                  properties: {
                    params: {
                      type: 'object',
                      additionalProperties: false,
                      required,
                      properties: Object.fromEntries(
                        value.parameters.map((parameter) => [
                          parameter.name,
                          valueSchema(parameter)
                        ])
                      )
                    },
                    requestId: {
                      type: 'string',
                      format: 'uuid',
                      pattern: uuidPattern,
                      description:
                        '可省略；若提供，每次调用须生成新的 UUID，不可复用。此标识关联原调用；本规范不包含取消控制面操作。'
                    }
                  }
                },
                example: { params: examples }
              }
            }
          },
          responses: {
            '200': {
              description: '成功查询或真实取消终态，请按 status 区分。',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/QueryApiSuccess' },
                      { $ref: '#/components/schemas/QueryApiCancelled' }
                    ]
                  }
                }
              }
            },
            '401': error,
            default: error
          }
        }
      }
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            '使用调用账号的有效访问令牌；接入时替换 YOUR_ACCESS_TOKEN，不包含当前登录凭据。'
        },
        ProjectApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'apikey',
          description: '使用项目公开 Key；接入时替换 YOUR_PUBLISHABLE_KEY，不使用服务角色密钥。'
        }
      },
      schemas: responseSchemas(value.maxRows)
    },
    'x-query-api-enabled': value.enabled,
    'x-query-api-max-rows': value.maxRows,
    'x-query-api-timeout-ms': value.timeoutMs
  }
}

export function queryApiOpenApiFileName(slug: string): string {
  if (typeof slug !== 'string' || !slugPattern.test(slug))
    throw new SqlQueryApiOpenApiError('查询 API 地址标识无效，请刷新列表后重试导出')
  return `${slug}.openapi.json`
}
