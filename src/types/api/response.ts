export interface QueryResult<T> {
  data: T | null
  error: unknown | null
  total?: number
}
