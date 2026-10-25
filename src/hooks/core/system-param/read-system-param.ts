import { fetchSystemParamByKey } from '@/api/system-manage/system-param'

type SystemParamItem = Api.SystemManage.SystemParamItem

interface ReadSystemParamOptions<TValue> {
  key: string
  fallback: TValue
  parse: (value: string, row: SystemParamItem) => TValue | undefined
}

const configuredValueCache = new Map<string, unknown>()
const pendingLoadCache = new Map<string, Promise<unknown>>()
let cacheVersion = 0

/**
 * 使已读取的系统参数失效，下一次读取会从服务端获取最新值。
 *
 * 版本号可防止刷新前已发出的请求在稍后返回时重新写入旧缓存。
 */
export const clearSystemParamCache = (key?: string): void => {
  cacheVersion++

  if (key) {
    configuredValueCache.delete(key)
    pendingLoadCache.delete(key)
    return
  }

  configuredValueCache.clear()
  pendingLoadCache.clear()
}

export const readSystemParamValue = async <TValue>(
  options: ReadSystemParamOptions<TValue>
): Promise<TValue> => {
  const cachedValue = configuredValueCache.get(options.key)
  if (cachedValue !== undefined) {
    return cachedValue as TValue
  }

  const pendingLoad = pendingLoadCache.get(options.key) as Promise<TValue> | undefined
  if (pendingLoad) {
    return pendingLoad
  }

  const loadVersion = cacheVersion
  const nextLoad = fetchSystemParamByKey(options.key)
    .then(({ data }) => {
      const parsedValue = data ? options.parse(data.paramValue, data) : undefined
      if (parsedValue !== undefined && loadVersion === cacheVersion) {
        configuredValueCache.set(options.key, parsedValue)
      }
      return parsedValue ?? options.fallback
    })
    .catch(() => options.fallback)
    .finally(() => {
      if (pendingLoadCache.get(options.key) === nextLoad) pendingLoadCache.delete(options.key)
    })

  pendingLoadCache.set(options.key, nextLoad)
  return nextLoad
}
