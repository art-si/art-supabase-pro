interface VehicleOrganizationSource {
  vehicleOwnership?: string | null
  companyName?: string | null
  carrier?: { companyName?: string | null } | null
}

interface VehicleOwnershipOrganization {
  label: '所属公司' | '所属承运商'
  name: string
}

/** Read the organization owned by the vehicle's ownership type, never a stale other relationship. */
export function getVehicleOwnershipOrganization(
  vehicle?: VehicleOrganizationSource | null
): VehicleOwnershipOrganization | null {
  if (!vehicle || vehicle.vehicleOwnership === 'individual_affiliation') return null
  if (vehicle.vehicleOwnership === 'carrier' || vehicle.vehicleOwnership === 'third_party') {
    return { label: '所属承运商', name: vehicle.carrier?.companyName?.trim() || '' }
  }
  return { label: '所属公司', name: vehicle.companyName?.trim() || '' }
}
