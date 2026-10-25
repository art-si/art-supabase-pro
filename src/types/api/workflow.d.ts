declare namespace Api {
  namespace Workflow {
    type DefinitionStatus = 'draft' | 'published' | 'disabled'
    type VersionStatus = 'draft' | 'published' | 'retired'
    type InstanceStatus = 'running' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled'
    type TaskStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
    type ApprovalMode = 'any' | 'all' | 'percentage'
    type AssigneeType = 'users' | 'roles' | 'initiator'
    type ConditionOperator =
      'always' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'not_empty'
    type ActionType =
      | 'submit'
      | 'approve'
      | 'reject'
      | 'withdraw'
      | 'cancel'
      | 'auto_skip'
      | 'delegate'
      | 'delegation_revoke'
      | 'transfer'
    type WorkflowAssignmentSource = 'direct' | 'delegation' | 'transfer'

    interface WorkflowCondition {
      field?: string
      operator: ConditionOperator
      value?: unknown
    }

    interface WorkflowAssignee {
      type: AssigneeType
      userIds?: string[]
      roleCodes?: string[]
    }

    interface WorkflowNode {
      key: string
      name: string
      order: number
      approvalMode: ApprovalMode
      approvalThresholdPercent: number
      rejectVetoEnabled: boolean
      allowSelfApproval: boolean
      dueHours: number
      reminderBeforeMinutes: number
      escalationEnabled: boolean
      escalateAfterHours: number
      assignee: WorkflowAssignee
      condition: WorkflowCondition
    }

    interface WorkflowCanvasPosition {
      x: number
      y: number
    }

    interface WorkflowCanvasLayout {
      mode: 'free' | 'horizontal' | 'vertical'
      positions: Record<string, WorkflowCanvasPosition>
    }

    interface WorkflowConfig {
      nodes: WorkflowNode[]
      allowAutoApprove?: boolean
      layout?: WorkflowCanvasLayout
    }

    interface WorkflowContextField {
      key: string
      label: string
      valueType: 'text' | 'number' | 'boolean' | 'date'
      help?: string
      dictCode?: string
      referenceType?: 'employee' | 'organization' | 'position' | 'business'
    }

    interface WorkflowBusinessMetric {
      label: string
      value: string
      tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    }

    interface WorkflowBusinessField {
      label: string
      value: string
    }

    interface WorkflowBusinessAttachment {
      name: string
      url: string
      fileType?: string | null
      fileSize?: string | null
    }

    interface WorkflowBusinessSnapshot {
      instanceId: string
      businessType: string
      businessId: string
      title: string
      subtitle?: string | null
      businessNo?: string | null
      status?: string | null
      routePath?: string | null
      metrics: WorkflowBusinessMetric[]
      fields: WorkflowBusinessField[]
      warnings: string[]
      attachments: WorkflowBusinessAttachment[]
      ocrEvidence?: {
        artifactId: string
        rawText: string
        capturedAt: string
      } | null
    }

    interface WorkflowVersionRecord {
      id: string
      definitionId: string
      versionNo: number
      status: VersionStatus
      config: WorkflowConfig
      changeNote?: string | null
      publishedAt?: string | null
      publishedBy?: string | null
      createBy?: string | null
      createTime: string
      updateBy?: string | null
      updateTime: string
      tenantId: string
    }

    interface WorkflowDefinitionRecord {
      id: string
      code: string
      name: string
      businessType: string
      description?: string | null
      status: DefinitionStatus
      currentVersionId?: string | null
      publishedAt?: string | null
      publishedBy?: string | null
      createBy?: string | null
      createTime: string
      updateBy?: string | null
      updateTime: string
      tenantId: string
      tenant?: WorkflowTenantOption
      versions?: WorkflowVersionRecord[]
    }

    interface WorkflowDefinitionSearchParams {
      keyword?: string
      businessType?: string
      businessTypes?: string[]
      status?: DefinitionStatus | ''
      tenantId?: string
      from?: number
      to?: number
    }

    interface WorkflowDefinitionSavePayload {
      id?: string
      code: string
      name: string
      businessType: string
      description?: string | null
      changeNote?: string | null
      tenantId?: string
      config: WorkflowConfig
    }

    interface WorkflowInstanceRecord {
      id: string
      definitionId: string
      versionId: string
      businessType: string
      businessId: string
      businessTitle: string
      initiatorUserId: string
      initiatorNameSnapshot: string
      status: InstanceStatus
      currentNodeKey?: string | null
      currentNodeName?: string | null
      contextSnapshot: Record<string, unknown>
      rowVersion: number
      startedAt: string
      finishedAt?: string | null
      finishComment?: string | null
      createTime: string
      definition?: Pick<WorkflowDefinitionRecord, 'id' | 'code' | 'name' | 'businessType'>
      version?: Pick<WorkflowVersionRecord, 'id' | 'versionNo' | 'config'>
      tasks?: WorkflowTaskRecord[]
      actions?: WorkflowActionRecord[]
    }

    interface WorkflowTaskRecord {
      id: string
      instanceId: string
      nodeKey: string
      nodeName: string
      nodeOrder: number
      approvalMode: ApprovalMode
      approvalThresholdPercent: number
      rejectVetoEnabled: boolean
      assigneeUserId: string
      assigneeNameSnapshot: string
      originalAssigneeUserId: string
      originalAssigneeNameSnapshot: string
      assignmentSource: WorkflowAssignmentSource
      delegationId?: string | null
      lastAssignedBy?: string | null
      assignmentReason?: string | null
      tenantId: string
      status: TaskStatus
      handledAt?: string | null
      comment?: string | null
      dueAt?: string | null
      createTime: string
      instance?: WorkflowInstanceRecord
      tenant?: WorkflowTenantOption
    }

    interface WorkflowActionRecord {
      id: string
      instanceId: string
      taskId?: string | null
      nodeKey?: string | null
      nodeName?: string | null
      action: ActionType
      actorUserId?: string | null
      actorNameSnapshot: string
      comment?: string | null
      metadata: Record<string, unknown>
      createTime: string
      actor?: WorkflowActorProfile | null
    }

    interface WorkflowActorProfile {
      id: string
      userName?: string | null
      nickName?: string | null
      userEmail: string
      avatar?: string | null
    }

    interface WorkflowDelegationRecord {
      id: string
      tenantId: string
      delegatorUserId: string
      delegateUserId: string
      startsAt: string
      endsAt: string
      reason: string
      revokedAt?: string | null
      revokedBy?: string | null
      revokeReason?: string | null
      createTime: string
      updateTime: string
      delegator?: WorkflowActorProfile | null
      delegate?: WorkflowActorProfile | null
    }

    interface WorkflowTaskSearchParams {
      keyword?: string
      businessType?: string
      status?: TaskStatus | ''
      slaStatus?: WorkflowSlaStatus | ''
      assigneeUserId: string
      from?: number
      to?: number
    }

    interface PlatformGlobalWorkflowTaskSearchParams {
      keyword?: string
      businessType?: string
      tenantId?: string
      from?: number
      to?: number
    }

    interface WorkflowTaskPage {
      records: WorkflowTaskRecord[]
      total: number
    }

    interface WorkflowNodeTaskRecord extends WorkflowTaskRecord {
      assigneeCount: number
      pendingAssigneeCount: number
      assigneeNames: string[]
    }

    interface WorkflowNodeTaskPage {
      records: WorkflowNodeTaskRecord[]
      total: number
      taskTotal: number
    }

    interface WorkflowInstanceSearchParams {
      keyword?: string
      businessType?: string
      status?: InstanceStatus | ''
      initiatorUserId: string
      from?: number
      to?: number
    }

    interface WorkflowWorkbenchSummary {
      pendingCount: number
      dueSoonPendingCount: number
      overduePendingCount: number
      handledCount: number
      initiatedRunningCount: number
      initiatedCompletedCount: number
    }

    type WorkflowSlaStatus = 'normal' | 'due_soon' | 'overdue'

    interface WorkflowMonitorRecord extends WorkflowInstanceRecord {
      definitionName: string
      definitionCode: string
      versionNo: number
      pendingTaskCount: number
      nearestDueAt?: string | null
      isOverdue: boolean
      durationHours: number
    }

    interface WorkflowMonitorSearchParams {
      keyword?: string
      businessType?: string
      status?: InstanceStatus | ''
      slaStatus?: WorkflowSlaStatus | ''
      from?: number
      to?: number
    }

    interface WorkflowMonitorPage {
      records: WorkflowMonitorRecord[]
      total: number
    }

    interface WorkflowMonitorSummary {
      runningCount: number
      overdueCount: number
      approved30dCount: number
      rejected30dCount: number
      cancelled30dCount: number
      averageDurationHours: number
    }

    interface WorkflowOperationalSummary {
      totalCount: number
      runningCount: number
      approvedCount: number
      rejectedCount: number
      interruptedCount: number
      overdueCount: number
      averageDurationHours: number
    }

    interface WorkflowBusinessAnalytics extends WorkflowOperationalSummary {
      businessType: string
      approvalRate: number
    }

    interface WorkflowDailyAnalytics {
      date: string
      startedCount: number
      approvedCount: number
      rejectedCount: number
    }

    interface WorkflowOperationalAnalytics {
      periodDays: number
      generatedAt: string
      summary: WorkflowOperationalSummary
      businessTypes: WorkflowBusinessAnalytics[]
      daily: WorkflowDailyAnalytics[]
    }

    type WorkflowAnalyticsRiskLevel = 'normal' | 'warning' | 'critical'

    interface WorkflowBottleneckSummary {
      taskCount: number
      pendingCount: number
      overduePendingCount: number
      handledCount: number
      slaMeasuredCount: number
      slaBreachedCount: number
      slaComplianceRate: number
      delegatedCount: number
      transferredCount: number
      averageHandleHours: number
      p90HandleHours: number
    }

    interface WorkflowNodeBottleneck {
      tenantId: string
      tenantName: string
      definitionId: string
      definitionName: string
      businessType: string
      nodeKey: string
      nodeName: string
      taskCount: number
      pendingCount: number
      overduePendingCount: number
      handledCount: number
      approvedCount: number
      rejectedCount: number
      slaMeasuredCount: number
      slaBreachedCount: number
      slaComplianceRate: number
      averageHandleHours: number
      p90HandleHours: number
      riskLevel: WorkflowAnalyticsRiskLevel
    }

    interface WorkflowApproverWorkload extends WorkflowBottleneckSummary {
      tenantId: string
      tenantName: string
      assigneeUserId: string
      assigneeName?: string | null
      approvedCount: number
      rejectedCount: number
      riskLevel: WorkflowAnalyticsRiskLevel
    }

    interface WorkflowBottleneckAnalytics {
      periodDays: number
      generatedAt: string
      minimumSampleSize: number
      summary: WorkflowBottleneckSummary
      nodes: WorkflowNodeBottleneck[]
      approvers: WorkflowApproverWorkload[]
    }

    type WorkflowCallbackStatus =
      'pending' | 'processing' | 'retry_wait' | 'succeeded' | 'dead_letter'

    interface WorkflowCallbackSummary {
      pending: number
      processing: number
      retryWait: number
      succeeded: number
      deadLetter: number
    }

    interface WorkflowCallbackRecord {
      id: string
      eventNo: number
      tenantId: string
      tenantName?: string | null
      instanceId: string
      businessTitle: string
      businessType: string
      businessId: string
      targetStatus: InstanceStatus
      status: WorkflowCallbackStatus
      attemptCount: number
      maxAttempts: number
      totalAttempts: number
      manualRetryCount: number
      nextAttemptAt: string
      processedAt?: string | null
      lastErrorCode?: string | null
      lastError?: string | null
      createTime: string
    }

    interface WorkflowCallbackOutbox {
      summary: WorkflowCallbackSummary
      items: WorkflowCallbackRecord[]
    }

    interface WorkflowUserOption {
      id: string
      userName?: string | null
      nickName?: string | null
      userEmail: string
      avatar?: string | null
    }

    interface WorkflowRoleOption {
      id: string
      roleCode: string
      roleName: string
    }

    interface WorkflowTenantOption {
      id: string
      tenantCode: string
      tenantName: string
    }

    interface WorkflowOptionSearchParams {
      tenantId?: string
    }
  }
}
