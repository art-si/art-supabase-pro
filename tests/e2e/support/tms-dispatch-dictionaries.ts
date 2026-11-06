interface DispatchFixtureDictionaryItem {
  name: string
  code: string
  value: string
  label: string
  status: string
  sort: number
}

const dict = (value: string, label: string) => ({
  name: label,
  code: value,
  value,
  label,
  status: '1',
  sort: 0
})

export const dispatchFixtureDictionaries: Record<string, DispatchFixtureDictionaryItem[]> = {
  vehicleOwnership: [
    dict('self_operated', '自营车辆'),
    dict('carrier', '承运商'),
    dict('third_party', '第三方物流'),
    dict('individual_affiliation', '个人挂靠')
  ],
  tmsDriverOwnership: [
    dict('self', '自营司机'),
    dict('carrier', '承运商司机'),
    dict('individual', '个体司机')
  ],
  sex: [dict('1', '男'), dict('2', '女')],
  tmsDriverLicenseType: [dict('A2', 'A2')],
  vehicleType: [dict('truck', '高栏车')],
  tmsDriverStatus: [dict('on_duty', '在岗'), dict('off_duty', '非在岗')],
  tmsDriverType: [dict('primary', '主司机'), dict('secondary', '备用司机')],
  tmsDriverAuthStatus: [dict('unverified', '未认证'), dict('verified', '已认证')],
  tmsCarrierDispatchChannel: [dict('offline', '线下'), dict('online', '线上')],
  tmsTransportAgreementStatus: [
    dict('pending_signed', '待签署'),
    dict('signed', '已签署'),
    dict('revision_requested', '待修改')
  ],
  tmsWaybillSplitBasis: [
    dict('quantity', '按件数'),
    dict('weight', '按重量'),
    dict('volume', '按体积')
  ],
  tmsDispatchOperatorMode: [
    dict('carrier', '承运方'),
    dict('self_operated', '自营'),
    dict('individual_driver', '个体司机')
  ]
}

export function dispatchFixtureDictionaryRows(url: URL) {
  const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
  const value = url.searchParams.get('value')?.replace(/^eq\./, '')
  return (dispatchFixtureDictionaries[code] || [])
    .filter((item) => !value || item.value === value)
    .map((item, index) => ({
      ...item,
      id: code + '-' + index,
      type_id: code,
      dict_type_table: { code, name: code }
    }))
}
