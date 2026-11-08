export type BffScalar = string | number | boolean | null
export type BffEnvironment = 'development' | 'staging' | 'production'
export type BffMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface BffPublishedInput {
  key: string
  label: string
  location: 'path' | 'query' | 'body'
  type: 'string' | 'number' | 'boolean'
  required: boolean
}

export interface BffPublishedOutput {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | null
}

/** The published, application-authorized catalog never contains upstream definitions. */
export interface BffPublishedApi {
  interfaceId: string
  code: string
  name: string
  method: BffMethod
  path: string
  environment: BffEnvironment
  version: number
  applicationCode: string
  applicationName: string
  inputs: BffPublishedInput[]
  resultKind: 'scalar' | 'page'
  outputs: BffPublishedOutput[]
  /** Public input keys only; no upstream or page-mapping internals. */
  pagination?: { currentInputKey: string; sizeInputKey: string }
}

export interface BffCatalog {
  records: BffPublishedApi[]
}

export interface BffPageResult {
  records: Array<Record<string, BffScalar>>
  total: number
  current: number
  size: number
}

export interface BffGatewayResult {
  code: 200
  msg: string
  requestId: string
  version: number
  data: Record<string, BffScalar> | BffPageResult
}
