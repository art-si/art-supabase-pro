export interface MaterialSelectCategory {
  id: string
  parentId?: string | null
  categoryCode: string
  categoryName: string
}

/** Minimal material identity; selectors preserve additional fields from each source DTO. */
export interface MaterialSelectRecord {
  id: string
  materialCode?: string | null
  materialName?: string | null
  description?: string | null
  specificationModel?: string | null
  drawingNo?: string | null
  materialComposition?: string | null
  brand?: string | null
  materialType?: string | null
  inboundWarehouseId?: string | null
  materialSource?: string | null
  specialPurchaseType?: string | null
  category?: { categoryName?: string | null } | null
  materialTypeRef?: { typeName?: string | null } | null
}
