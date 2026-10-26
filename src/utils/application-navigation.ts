import { fetchAccessibleApplications } from '@/api/system-manage/application-access'
import {
  currentApplication,
  resolveApplicationBaseUrl,
  type ApplicationCode
} from '@/config/application'
import { router } from '@/router'
import { stringifyQuery, type LocationQueryRaw, type Router } from 'vue-router'

export async function navigateToApplication(
  applicationCode: ApplicationCode,
  routePath: string,
  query?: LocationQueryRaw,
  navigationRouter: Pick<Router, 'push'> = router
): Promise<void> {
  const { data, error } = await fetchAccessibleApplications()
  if (error) throw error

  const application = data?.find((item) => item.code === applicationCode)
  if (!application) {
    throw new Error('当前账号没有目标应用的访问权限')
  }

  const routeQuery = stringifyQuery(query ?? {})

  const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`
  // 开发时平台宿主已注册业务路由，直接切换即可，不依赖独立应用端口同时启动。
  if (currentApplication.code === 'platform' && import.meta.env?.DEV) {
    await navigationRouter.push({ path: normalizedPath, query })
    return
  }

  if (!application.baseUrl) {
    throw new Error('目标应用尚未配置访问地址')
  }

  const target = resolveApplicationBaseUrl(
    applicationCode,
    application.baseUrl,
    window.location,
    currentApplication.code === 'platform'
      ? import.meta.env.VITE_HOSTED_APPLICATION_BASE_URL
      : undefined
  )
  target.hash = `${normalizedPath}${routeQuery ? `?${routeQuery}` : ''}`
  window.location.assign(target.toString())
}
