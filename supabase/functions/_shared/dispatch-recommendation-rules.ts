export interface DispatchRecommendationInput {
  order: Record<string, unknown>
  vehicles: Array<Record<string, unknown>>
  activeAssignments?: Array<Record<string, unknown>>
  history?: Array<Record<string, unknown>>
  now?: Date
  limit?: number
}

export interface DispatchRecommendationDriver {
  id: string
  driverName: string
  phone: string | null
  licenseType: string | null
  licenseExpireDate: string | null
}

export interface DispatchRecommendationVehicle {
  id: string
  carrierId: string | null
  plateNo: string
  companyName: string | null
  vehicleType: string | null
  tonnageOrSeat: string | null
  overallLength: number | null
  approvedLoadMass: number | null
  primaryDriver: DispatchRecommendationDriver
}

export interface DispatchRecommendation {
  rank: number
  score: number
  confidence: number
  vehicle: DispatchRecommendationVehicle
  reasons: string[]
  warnings: string[]
  metrics: {
    capacityUtilization: number | null
    routeTrips: number
    historyTrips: number
    onTimeRate: number | null
  }
}

export interface DispatchRecommendationResult {
  recommendations: DispatchRecommendation[]
  evaluatedVehicles: number
  eligibleVehicles: number
  rejectedVehicles: number
  rejectedByReason: Record<string, number>
}

interface EligibleVehicle {
  vehicle: DispatchRecommendationVehicle
  operationRoute: string
  warnings: string[]
}

const ACTIVE_DISPATCH_STATUSES = new Set([
  'loaded',
  'dispatched',
  'loading',
  'transporting',
  'unloading'
])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function timeValue(value: unknown): number | null {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function formatUtilization(value: number): string {
  const percentage = Math.round(value * 100)
  return value > 0 && percentage === 0 ? '<1%' : `${percentage}%`
}

function normalizedDriver(vehicle: Record<string, unknown>): Record<string, unknown> {
  return record(vehicle.primaryDriver ?? vehicle.primary_driver)
}

function checkVehicleEligibility(
  rawVehicle: Record<string, unknown>,
  busyVehicleIds: Set<string>,
  busyDriverIds: Set<string>,
  orderWeightKg: number | null,
  now: number,
  rejectedByReason: Record<string, number>
): EligibleVehicle | null {
  const id = text(rawVehicle.id)
  const plateNo = text(rawVehicle.plate_no ?? rawVehicle.plateNo)
  const auditStatus = text(rawVehicle.audit_status ?? rawVehicle.auditStatus)
  const operationStatus = text(rawVehicle.operation_status ?? rawVehicle.operationStatus)
  const driver = normalizedDriver(rawVehicle)
  const driverId = text(
    driver.id ?? rawVehicle.primary_driver_id ?? rawVehicle.primaryDriverId
  )
  const driverName = text(driver.driver_name ?? driver.driverName)
  const driverEnabled = driver.enabled
  const approvedLoadMass = numberValue(
    rawVehicle.approved_load_mass ?? rawVehicle.approvedLoadMass
  )
  const licenseExpireDate = text(driver.license_expire_date ?? driver.licenseExpireDate) || null
  const serviceEndTime = timeValue(rawVehicle.service_end_time ?? rawVehicle.serviceEndTime)

  if (!id || !plateNo || auditStatus !== 'approved' || operationStatus !== 'operating') {
    increment(rejectedByReason, 'ineligible_vehicle')
    return null
  }
  if (!driverId || !driverName || driverEnabled === false) {
    increment(rejectedByReason, 'unavailable_driver')
    return null
  }
  if (busyVehicleIds.has(id) || busyDriverIds.has(driverId)) {
    increment(rejectedByReason, 'active_assignment')
    return null
  }
  if (serviceEndTime !== null && serviceEndTime < now) {
    increment(rejectedByReason, 'service_expired')
    return null
  }

  const licenseExpireTime = timeValue(licenseExpireDate)
  if (licenseExpireTime !== null && licenseExpireTime < now) {
    increment(rejectedByReason, 'license_expired')
    return null
  }
  if (
    orderWeightKg !== null &&
    approvedLoadMass !== null &&
    orderWeightKg > approvedLoadMass
  ) {
    increment(rejectedByReason, 'capacity_exceeded')
    return null
  }

  const warnings: string[] = []
  if (approvedLoadMass === null) warnings.push('车辆未维护核定载质量，请人工核对载重')
  if (!licenseExpireDate) warnings.push('司机驾驶证到期日未维护')
  if (licenseExpireTime !== null && licenseExpireTime - now <= 30 * 86_400_000) {
    warnings.push('司机驾驶证将在 30 天内到期')
  }

  return {
    vehicle: {
      id,
      carrierId: text(rawVehicle.carrier_id ?? rawVehicle.carrierId) || null,
      plateNo,
      companyName: text(rawVehicle.company_name ?? rawVehicle.companyName) || null,
      vehicleType: text(rawVehicle.vehicle_type ?? rawVehicle.vehicleType) || null,
      tonnageOrSeat: text(rawVehicle.tonnage_or_seat ?? rawVehicle.tonnageOrSeat) || null,
      overallLength: numberValue(rawVehicle.overall_length ?? rawVehicle.overallLength),
      approvedLoadMass,
      primaryDriver: {
        id: driverId,
        driverName,
        phone: text(driver.phone) || null,
        licenseType: text(driver.license_type ?? driver.licenseType) || null,
        licenseExpireDate
      }
    },
    operationRoute: text(rawVehicle.operation_route ?? rawVehicle.operationRoute),
    warnings
  }
}

export function recommendDispatchResources(
  input: DispatchRecommendationInput
): DispatchRecommendationResult {
  const now = input.now?.getTime() ?? Date.now()
  const limit = clamp(Math.trunc(input.limit ?? 5), 1, 10)
  const orderId = text(input.order.id)
  const origin = text(input.order.origin_station ?? input.order.originStation)
  const destination = text(input.order.destination_station ?? input.order.destinationStation)
  const orderWeightKg = numberValue(
    input.order.cargo_weight_total ?? input.order.cargoWeightTotal
  )
  const activeAssignments = input.activeAssignments ?? []
  const history = input.history ?? []
  const busyVehicleIds = new Set<string>()
  const busyDriverIds = new Set<string>()

  for (const assignment of activeAssignments) {
    if (text(assignment.id) === orderId) continue
    if (!ACTIVE_DISPATCH_STATUSES.has(text(assignment.dispatch_status ?? assignment.dispatchStatus))) {
      continue
    }
    const vehicleId = text(assignment.dispatch_vehicle_id ?? assignment.dispatchVehicleId)
    const driverId = text(assignment.dispatch_driver_id ?? assignment.dispatchDriverId)
    if (vehicleId) busyVehicleIds.add(vehicleId)
    if (driverId) busyDriverIds.add(driverId)
  }

  const rejectedByReason: Record<string, number> = {}
  const eligible = input.vehicles
    .map((vehicle) =>
      checkVehicleEligibility(
        vehicle,
        busyVehicleIds,
        busyDriverIds,
        orderWeightKg,
        now,
        rejectedByReason
      )
    )
    .filter((vehicle): vehicle is EligibleVehicle => Boolean(vehicle))

  const scoredRecommendations: DispatchRecommendation[] = eligible
    .map(({ vehicle, operationRoute, warnings }) => {
      const vehicleHistory = history.filter(
        (item) => text(item.dispatch_vehicle_id ?? item.dispatchVehicleId) === vehicle.id
      )
      const routeHistory = vehicleHistory.filter(
        (item) =>
          text(item.origin_station ?? item.originStation) === origin &&
          text(item.destination_station ?? item.destinationStation) === destination
      )
      const punctualRows = vehicleHistory.filter(
        (item) =>
          timeValue(item.planned_arrival_time ?? item.plannedArrivalTime) !== null &&
          timeValue(item.signed_at ?? item.signedAt) !== null
      )
      const onTimeRows = punctualRows.filter((item) => {
        const planned = timeValue(item.planned_arrival_time ?? item.plannedArrivalTime)
        const signed = timeValue(item.signed_at ?? item.signedAt)
        return planned !== null && signed !== null && signed <= planned
      })
      const onTimeRate = punctualRows.length ? onTimeRows.length / punctualRows.length : null
      const capacityUtilization =
        orderWeightKg !== null && vehicle.approvedLoadMass
          ? orderWeightKg / vehicle.approvedLoadMass
          : null
      const reasons: string[] = []
      let score = 45

      if (capacityUtilization !== null) {
        if (capacityUtilization >= 0.55 && capacityUtilization <= 0.95) {
          score += 15
          reasons.push(`载重利用率 ${formatUtilization(capacityUtilization)}，匹配度较高`)
        } else if (capacityUtilization >= 0.35) {
          score += 11
          reasons.push(`载重利用率 ${formatUtilization(capacityUtilization)}，容量充足`)
        } else {
          score += 6
          reasons.push(`车辆容量充足，载重利用率 ${formatUtilization(capacityUtilization)}`)
        }
      } else {
        score -= 5
      }

      if (routeHistory.length) {
        score += Math.min(15, routeHistory.length * 3)
        reasons.push(`近 180 天完成同线路 ${routeHistory.length} 单`)
      } else if (origin && destination && operationRoute.includes(origin) && operationRoute.includes(destination)) {
        score += 8
        reasons.push('车辆登记营运线路覆盖本次起讫站')
      }

      if (onTimeRate !== null && punctualRows.length >= 3) {
        score += Math.round(onTimeRate * 12)
        reasons.push(`历史准点率 ${Math.round(onTimeRate * 100)}%（${punctualRows.length} 单）`)
      }

      const workloadBonus = Math.max(0, 8 - Math.min(8, vehicleHistory.length))
      score += workloadBonus
      if (workloadBonus >= 5) reasons.push('近期任务较少，有利于车队负载均衡')
      if (!reasons.length) reasons.push('车辆和司机通过基础资格校验')

      let confidence = 0.45
      if (capacityUtilization !== null) confidence += 0.15
      if (punctualRows.length >= 3) confidence += 0.15
      if (routeHistory.length) confidence += 0.1
      if (vehicle.primaryDriver.licenseExpireDate) confidence += 0.05
      if (operationRoute) confidence += 0.05

      return {
        rank: 0,
        score: clamp(Math.round(score), 0, 99),
        confidence: Math.round(clamp(confidence, 0, 0.95) * 100) / 100,
        vehicle,
        reasons: reasons.slice(0, 4),
        warnings: warnings.slice(0, 3),
        metrics: {
          capacityUtilization:
            capacityUtilization === null ? null : Math.round(capacityUtilization * 1000) / 1000,
          routeTrips: routeHistory.length,
          historyTrips: vehicleHistory.length,
          onTimeRate: onTimeRate === null ? null : Math.round(onTimeRate * 1000) / 1000
        }
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score || right.confidence - left.confidence ||
        left.vehicle.plateNo.localeCompare(right.vehicle.plateNo, 'zh-CN')
    )

  const selectedRecommendations: DispatchRecommendation[] = []
  const selectedVehicleIds = new Set<string>()
  const selectedDriverIds = new Set<string>()
  for (const item of scoredRecommendations) {
    if (selectedDriverIds.has(item.vehicle.primaryDriver.id)) continue
    selectedRecommendations.push(item)
    selectedVehicleIds.add(item.vehicle.id)
    selectedDriverIds.add(item.vehicle.primaryDriver.id)
    if (selectedRecommendations.length >= limit) break
  }
  for (const item of scoredRecommendations) {
    if (selectedRecommendations.length >= limit) break
    if (selectedVehicleIds.has(item.vehicle.id)) continue
    selectedRecommendations.push(item)
    selectedVehicleIds.add(item.vehicle.id)
  }

  const recommendations = selectedRecommendations
    .map((item, index) => ({ ...item, rank: index + 1 }))

  return {
    recommendations,
    evaluatedVehicles: input.vehicles.length,
    eligibleVehicles: eligible.length,
    rejectedVehicles: input.vehicles.length - eligible.length,
    rejectedByReason
  }
}
