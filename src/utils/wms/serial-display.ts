interface SerialParentReference {
  parentSerialId: string | null
  parent?: { serialNo: string } | null
}

export function formatWmsSerialParent(serial: SerialParentReference): string {
  if (!serial.parentSerialId) return '独立件 / 主机'
  return serial.parent?.serialNo || '父件资料不可用'
}
