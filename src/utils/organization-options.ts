import TreeUtils from './tree'

interface OrganizationNode {
  id?: string
  tenantId?: string
  organizationCode: string
  organizationName: string
  children?: OrganizationNode[]
}

interface AllowedOrganization {
  id: string
  tenantId?: string
  isDefault?: boolean
}

export interface OrganizationSelectOption {
  id: string
  tenantId: string
  code: string
  name: string
  isDefault?: boolean
  disabled: boolean
  children?: OrganizationSelectOption[]
}

/** Keep ancestors visible without granting selection beyond the business API's allowed IDs. */
export function buildOrganizationSelectTree(
  organizations: OrganizationNode[],
  allowed: AllowedOrganization[]
): OrganizationSelectOption[] {
  const byId = new Map(allowed.map((option) => [option.id, option]))
  return new TreeUtils().mapTree<OrganizationNode, OrganizationSelectOption>(
    organizations,
    (node) => {
      if (!node.id || !node.tenantId) throw new Error('组织资料不完整，请刷新后重试')
      const option = byId.get(node.id)
      const selectable = Boolean(option && (!option.tenantId || option.tenantId === node.tenantId))
      return {
        id: node.id,
        tenantId: node.tenantId,
        code: node.organizationCode,
        name: node.organizationName,
        isDefault: selectable && option?.isDefault === true,
        disabled: !selectable
      }
    }
  )
}
