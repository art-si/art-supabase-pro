import type { RouteLocationRaw } from 'vue-router'
import { financePaths } from '@/router/business-paths'

type Artifact = Api.IntelligentRecognition.RecognitionArtifact

export function getRecognitionMetadataText(artifact: Artifact, key: string): string {
  const value = artifact.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

/** Resolve a platform navigation target from a recognition artifact's public contract. */
export function buildRecognitionBusinessRoute(artifact: Artifact): RouteLocationRaw {
  const commonQuery = { aiArtifactId: artifact.id }

  if (artifact.feature === 'invoice_ocr') {
    return {
      path: financePaths.invoiceManagement,
      query: {
        ...commonQuery,
        direction: getRecognitionMetadataText(artifact, 'direction') || 'output'
      }
    }
  }

  if (artifact.feature === 'cash_voucher_ocr') {
    const direction = getRecognitionMetadataText(artifact, 'direction') || 'receipt'
    return {
      path:
        direction === 'payment' ? financePaths.paymentApplication : financePaths.cashTransaction,
      query: { ...commonQuery, direction }
    }
  }

  if (artifact.feature === 'waybill_expense_ocr') {
    return { path: financePaths.waybillCost, query: commonQuery }
  }

  return {
    path: '/tms/delivery-management',
    query: {
      ...commonQuery,
      orderId: getRecognitionMetadataText(artifact, 'orderId'),
      keyword: getRecognitionMetadataText(artifact, 'orderNo')
    }
  }
}
