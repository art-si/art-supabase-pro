export interface MasterDataDeleteProcessingContext {
  active: boolean
  addressId: string
  carrierId: string
  cargoId: string
  customerId: string
  customerName: string
  driverId: string
  recordId: string
  recordNo: string
  resourceId: string
  vehicleId: string
}

const toQueryText = (value: unknown): string => (typeof value === 'string' ? value : '')

export function useMasterDataDeleteProcessingContext() {
  const route = useRoute()

  return computed<MasterDataDeleteProcessingContext>(() => {
    const active = route.query.fromCustomerDelete === '1' || route.query.fromMasterDelete === '1'
    const scopedText = (value: unknown): string => (active ? toQueryText(value) : '')

    return {
      active,
      addressId: scopedText(route.query.addressId),
      carrierId: scopedText(route.query.carrierId),
      cargoId: scopedText(route.query.cargoId),
      customerId: scopedText(route.query.customerId),
      customerName: scopedText(route.query.customerName),
      driverId: scopedText(route.query.driverId),
      recordId: scopedText(route.query.recordId),
      recordNo: scopedText(route.query.recordNo),
      resourceId: scopedText(route.query.resourceId),
      vehicleId: scopedText(route.query.vehicleId)
    }
  })
}
