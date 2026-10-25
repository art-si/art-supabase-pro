export type AddressCoordinateSystem = 'gcj02' | 'wgs84' | 'bd09' | (string & {})

export type AddressCoordinateSource =
  'device_geolocation' | 'geocode' | 'map_pick' | 'import' | (string & {})

export type AddressCoordinateStatus =
  'pending' | 'located' | 'failed' | 'unconfirmed' | (string & {})

export interface AddressRegionOption {
  name: string
  code?: string
  children?: AddressRegionOption[]
  [key: string]: unknown
}

export interface AddressLocationPayload {
  regionPath: string[]
  region: string
  regionAdcode?: string
  addressDetail: string
  fullAddress: string
  longitude?: number | string | null
  latitude?: number | string | null
  coordinateSystem: AddressCoordinateSystem
  coordinateSource?: AddressCoordinateSource | ''
  coordinateStatus: AddressCoordinateStatus
  geocodeProvider?: string
  geocodedAt?: string
}

export interface AddressMapOpenData {
  regionPath: string[]
  regionAdcode?: string
  addressDetail: string
  fullAddress: string
  longitude?: number | string | null
  latitude?: number | string | null
}

export interface AddressMapPickResult {
  address: string
  longitude: number | string
  latitude: number | string
  regionPath: string[]
  regionAdcode?: string
}

export interface AddressGeocodeResult {
  longitude: number | string
  latitude: number | string
  coordinateSystem?: AddressCoordinateSystem
  coordinateSource?: AddressCoordinateSource
  coordinateStatus?: AddressCoordinateStatus
  regionPath?: string[]
  regionAdcode?: string
  geocodeProvider?: string
  geocodedAt?: string
}

export type AddressGeocodeFn = (
  payload: AddressLocationPayload
) => Promise<AddressGeocodeResult | null | undefined>

export interface AddressLocateOptions {
  silent?: boolean
}

export interface ArtAddressPickerExpose {
  locateCurrent: (options?: AddressLocateOptions) => Promise<AddressLocationPayload | undefined>
  /** End this control's wait and ignore late device-location callbacks. */
  cancelLocate: () => void
  openPicker: () => Promise<void>
}
