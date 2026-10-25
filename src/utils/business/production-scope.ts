interface ProductionScopeDepartment {
  id: string
  tenantId: string
  parentId: string | null
}

interface ProductionScopeCenter {
  tenantId: string
  departmentId: string
}

/** Index departments containing a center, including same-tenant ancestors, in O(D + C). */
export function getDepartmentsWithWorkCenters(
  departments: readonly ProductionScopeDepartment[],
  centers: readonly ProductionScopeCenter[]
): ReadonlySet<string> {
  const byId = new Map(departments.map((department) => [department.id, department]))
  const result = new Set<string>()
  for (const center of centers) {
    let department = byId.get(center.departmentId)
    while (department && department.tenantId === center.tenantId && !result.has(department.id)) {
      result.add(department.id)
      const parentId = department.parentId
      department = parentId ? byId.get(parentId) : undefined
    }
  }
  return result
}
