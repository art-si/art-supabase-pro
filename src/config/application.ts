/**
 * Runtime identity for the independently deployable applications.
 *
 * Authentication, tenants and RBAC stay in the platform Supabase project. Each
 * frontend declares only its own application code and requests the matching
 * menu tree from the platform contract.
 */
export const APPLICATION_CODES = [
  'platform',
  'fms',
  'hr',
  'mdm',
  'mes',
  'pmis',
  'scm',
  'smis',
  'tms',
  'vms',
  'wms'
] as const

export type ApplicationCode = (typeof APPLICATION_CODES)[number]

export interface ApplicationProfile {
  code: ApplicationCode
  name: string
  description: string
  defaultPath: string
  deploymentPath: string
  developmentPort: number
}

export interface ApplicationLocation {
  hostname: string
  origin: string
}

export const APPLICATION_PROFILES: Record<ApplicationCode, ApplicationProfile> = {
  platform: {
    code: 'platform',
    name: '平台管理',
    description: '系统、租户、菜单、权限与数据中心基座',
    defaultPath: '/dashboard',
    deploymentPath: '/art-supabase-pro/',
    developmentPort: 3006
  },
  fms: {
    code: 'fms',
    name: 'FMS财务管理',
    description: '财务管理系统',
    defaultPath: '/fms',
    deploymentPath: '/art-supabase-fms/',
    developmentPort: 3012
  },
  hr: {
    code: 'hr',
    name: 'HR人力资源管理',
    description: '人力资源管理系统',
    defaultPath: '/hr',
    deploymentPath: '/art-supabase-hr/',
    developmentPort: 3013
  },
  mdm: {
    code: 'mdm',
    name: 'MDM主数据管理',
    description: '跨业务域主数据治理与统一目录',
    defaultPath: '/mdm/workbench',
    deploymentPath: '/art-supabase-mdm/',
    developmentPort: 3017
  },
  mes: {
    code: 'mes',
    name: 'MES生产管理',
    description: '生产执行、工艺与制造协同',
    defaultPath: '/mes/workbench',
    deploymentPath: '/art-supabase-mes/',
    developmentPort: 3019
  },
  pmis: {
    code: 'pmis',
    name: 'PMIS设备管理',
    description: '设备点检、巡检与预防性维护管理',
    defaultPath: '/pmis/inspection/inspection-sheet',
    deploymentPath: '/art-supabase-pmis/',
    developmentPort: 3020
  },
  scm: {
    code: 'scm',
    name: 'SCM供应链管理',
    description: '销售报价、销售合同、订单与发运协同',
    defaultPath: '/scm/sales-quotation/expense-definition',
    deploymentPath: '/art-supabase-scm/',
    developmentPort: 3021
  },
  smis: {
    code: 'smis',
    name: 'SMIS安全生产管理',
    description: '安全生产管理系统',
    defaultPath: '/smis',
    deploymentPath: '/art-supabase-smis/',
    developmentPort: 3014
  },
  tms: {
    code: 'tms',
    name: 'TMS运输管理',
    description: '智慧运输管理系统',
    defaultPath: '/tms/order-open',
    deploymentPath: '/art-supabase-tms/',
    developmentPort: 3016
  },
  vms: {
    code: 'vms',
    name: 'VMS车辆管理',
    description: '车辆管理系统',
    defaultPath: '/vms/vehicle-archive-manage',
    deploymentPath: '/art-supabase-vms/',
    developmentPort: 3015
  },
  wms: {
    code: 'wms',
    name: 'WMS仓储管理',
    description: '仓库、库存与作业执行',
    defaultPath: '/wms/workbench',
    deploymentPath: '/art-supabase-wms/',
    developmentPort: 3018
  }
}

export function resolveApplicationCode(value: string | undefined): ApplicationCode {
  const normalized = value?.trim().toLowerCase()
  return APPLICATION_CODES.includes(normalized as ApplicationCode)
    ? (normalized as ApplicationCode)
    : 'platform'
}

export function resolveApplicationBaseUrl(
  applicationCode: ApplicationCode,
  configuredBaseUrl: string,
  location: ApplicationLocation,
  hostedBaseUrl?: string
): URL {
  const baseUrl =
    hostedBaseUrl ||
    (location.hostname.toLowerCase().endsWith('.github.io')
      ? APPLICATION_PROFILES[applicationCode].deploymentPath
      : configuredBaseUrl)

  return new URL(baseUrl, location.origin)
}

/**
 * 平台宿主聚合当前用户有权访问的应用；独立子应用始终只加载自己的菜单。
 * 菜单明细仍由数据库按用户角色过滤，这里只确定需要请求的应用范围。
 */
export function resolveHostedApplicationCodes(
  applicationCode: ApplicationCode,
  accessibleApplications: ReadonlyArray<{ code: ApplicationCode }>
): ApplicationCode[] {
  if (applicationCode !== 'platform') return [applicationCode]

  const accessibleCodes = new Set<ApplicationCode>([
    'platform',
    ...accessibleApplications.map((application) => application.code)
  ])
  return APPLICATION_CODES.filter((code) => accessibleCodes.has(code))
}

const runtimeEnv = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env

export const currentApplication = Object.freeze(
  APPLICATION_PROFILES[resolveApplicationCode(runtimeEnv?.VITE_APP_CODE)]
)
