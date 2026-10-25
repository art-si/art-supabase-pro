import type { EmployeeIntegrationItem } from '@/api/integration/employees'

interface EmployeeReference {
  id: string
  tenantId?: string
  code?: string | null
  name?: string | null
  employeeNo?: string | null
  employeeName?: string | null
  jobTitle?: string | null
}

/** Convert an already authorized joined employee into picker display data. */
export function employeeReferenceSelection(
  reference: EmployeeReference | null | undefined,
  tenantId: string | null | undefined
): EmployeeIntegrationItem[] {
  if (!reference || !tenantId || (reference.tenantId && reference.tenantId !== tenantId)) return []
  return [
    {
      id: reference.id,
      tenantId,
      employeeNo: reference.employeeNo ?? reference.code ?? '',
      employeeName: reference.employeeName ?? reference.name ?? '未命名员工',
      jobTitle: reference.jobTitle,
      employmentStatus: ''
    }
  ]
}
