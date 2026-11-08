import { defineComponent, h } from 'vue'
import type { DataSelectColumn } from '@/components/core/forms/art-data-select/types'
import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
import { isPrivateAttachmentPath } from '@/utils/supabase/private-attachment'

interface ResourceDriver {
  driverName?: string
  portraitUrl?: string | null
  portraitPreviewUrl?: string | null
  identityAuthStatus?: string | null
  licenseAuthStatus?: string | null
  qualificationAuthStatus?: string | null
}

/** Canonical decision columns for every vehicle/driver picker. Masking belongs to its secure API. */
function driverPortrait(driver?: ResourceDriver | null) {
  const url =
    driver?.portraitPreviewUrl ||
    (driver?.portraitUrl && !isPrivateAttachmentPath(driver.portraitUrl)
      ? driver.portraitUrl
      : null)
  return defineComponent({
    render: () =>
      url
        ? h('img', {
            src: url,
            alt: `${driver?.driverName || '司机'}的照片`,
            width: 36,
            height: 36,
            class: 'h-9 w-9 rounded-[var(--el-border-radius-base)] object-cover'
          })
        : h(
            'span',
            {
              class:
                'inline-flex h-9 w-9 items-center justify-center text-[var(--el-text-color-secondary)]',
              'aria-label': '暂无照片'
            },
            '—'
          )
  })
}

/** Both pickers show the same decision fields; only the authoritative resource scope differs. */
export function vehicleDriverColumns(
  resource: 'vehicle' | 'driver',
  includeAgreement = false
): DataSelectColumn[] {
  const driver = resource === 'vehicle' ? 'primaryDriver.' : ''
  const vehicle = resource === 'driver' ? 'vehicle.' : ''
  const columns: DataSelectColumn[] = [
    { prop: 'plateNo', label: '车牌号', minWidth: 130 },
    {
      prop: `${vehicle}vehicleOwnership`,
      label: '车辆归属',
      minWidth: 110,
      dict: { code: 'vehicleOwnership', display: 'text' }
    },
    {
      prop: `${driver}portraitUrl`,
      label: '照片',
      width: 72,
      formatter: (row) => driverPortrait(resource === 'driver' ? row : row.primaryDriver)
    },
    { prop: `${driver}driverName`, label: '司机', minWidth: 120 },
    { prop: `${driver}phone`, label: '联系电话', minWidth: 135 },
    { prop: `${driver}gender`, label: '性别', width: 80, dict: { code: 'sex', display: 'text' } },
    {
      prop: `${driver}licenseType`,
      label: '驾照类型',
      minWidth: 110,
      dict: { code: 'tmsDriverLicenseType', display: 'text' }
    },
    {
      prop: `${driver}driverOwnership`,
      label: '司机归属',
      minWidth: 110,
      dict: { code: 'tmsDriverOwnership', display: 'text' }
    },
    { prop: 'companyName', label: '所属公司', minWidth: 180 },
    { prop: 'carrierName', label: '所属承运商', minWidth: 180 },
    {
      prop: `${vehicle}vehicleType`,
      label: '车型',
      minWidth: 110,
      dict: { code: 'vehicleType', display: 'text' }
    },
    { prop: `${vehicle}specLengthM`, label: '车长（米）', minWidth: 110 },
    { prop: `${vehicle}loadTons`, label: '载重（吨）', minWidth: 110 },
    {
      prop: `${driver}driverStatus`,
      label: '司机状态',
      minWidth: 110,
      dict: { code: 'tmsDriverStatus', display: 'text' }
    },
    {
      prop: `${driver}driverType`,
      label: '司机类型',
      minWidth: 110,
      dict: { code: 'tmsDriverType', display: 'text' }
    },
    { prop: `${driver}licenseExpireDate`, label: '驾照到期日期', minWidth: 125 },
    {
      prop: `${driver}identityAuthStatus`,
      label: '认证状态',
      minWidth: 200,
      formatter: (row) => {
        const person = resource === 'driver' ? row : row.primaryDriver
        return defineComponent({
          render: () =>
            h('div', { class: 'grid gap-1' }, [
              h('span', [
                '身份：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.identityAuthStatus || 'unverified'
                })
              ]),
              h('span', [
                '驾驶证：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.licenseAuthStatus || 'unverified'
                })
              ]),
              h('span', [
                '从业资格：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.qualificationAuthStatus || 'unverified'
                })
              ])
            ])
        })
      }
    }
  ]
  if (includeAgreement)
    columns.push({
      prop: `${driver}agreementStatus`,
      label: '协议状态',
      minWidth: 110,
      dict: { code: 'tmsTransportAgreementStatus', display: 'text' }
    })
  return columns
}

/** The same searchable table dialog is used by metadata forms and direct pickers. */
export function vehicleDriverSelectProps(resource: 'vehicle' | 'driver') {
  return {
    mode: 'table' as const,
    multiple: false,
    columns: vehicleDriverColumns(resource),
    rowKey: 'id',
    labelKey: resource === 'vehicle' ? 'plateNo' : 'driverName',
    descriptionKey: resource === 'vehicle' ? 'companyName' : 'phone',
    title: resource === 'vehicle' ? '选择车辆' : '选择司机',
    dialogWidth: 'xl' as const,
    showTableHeader: true,
    showPagination: true,
    showSelectedPanel: false,
    clearable: true,
    searchPlaceholder: '搜索车牌、司机、电话、公司或承运商',
    emptyText: resource === 'vehicle' ? '暂无可选车辆' : '暂无可选司机',
    emptyDescription: '请核对搜索条件及所属范围，或先维护相应档案。'
  }
}
