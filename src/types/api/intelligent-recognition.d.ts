declare namespace Api {
  namespace IntelligentRecognition {
    type Feature =
      'invoice_ocr' | 'waybill_receipt_ocr' | 'cash_voucher_ocr' | 'waybill_expense_ocr'
    type ArtifactStatus = 'pending' | 'applied' | 'rejected' | 'superseded'

    interface RecognitionRun {
      id: string
      model?: string | null
      status: string
      latencyMs?: number | null
      errorCode?: string | null
      errorMessage?: string | null
      metadata?: Record<string, unknown> | null
      startedAt?: string | null
      finishedAt?: string | null
    }

    interface RecognitionArtifactMetadata extends Record<string, unknown> {
      imageCount?: number
      imageUrls?: string[]
    }

    interface RecognitionArtifact {
      id: string
      aiRunId: string
      authUserId: string
      tenantId?: string | null
      feature: Feature
      artifactType: string
      status: ArtifactStatus
      proposedPayload: Record<string, unknown>
      rawOcrText: string
      finalPayload?: Record<string, unknown> | null
      confidence?: number | null
      fieldConfidence?: Record<string, number> | null
      warnings?: string[] | null
      acceptedFields?: string[] | null
      correctedFields?: string[] | null
      entityType?: string | null
      entityId?: string | null
      reviewNote?: string | null
      reviewedAt?: string | null
      metadata?: RecognitionArtifactMetadata | null
      createBy?: string | null
      createTime: string
      updateBy?: string | null
      updateTime?: string | null
      run?: RecognitionRun | null
    }

    interface ArtifactSearchParams extends Api.Common.CommonSearchParams {
      artifactId?: string
      creator?: string
      feature?: Feature | ''
      status?: ArtifactStatus | ''
      confidenceLevel?: 'low' | 'medium' | 'high' | ''
      createTimeRange?: string[]
      sort?: 'risk' | 'recent'
    }

    interface RecognitionOverview {
      total: number
      pending: number
      applied: number
      rejected: number
      lowConfidence: number
      pendingLowConfidence: number
      today: number
      avgConfidence: number
      byFeature: Partial<Record<Feature, number>>
    }
  }
}
