/**
 * API 接口类型定义模块
 *
 * 提供所有后端接口的类型定义
 *
 * ## 主要功能
 *
 * - 通用类型（分页参数、响应结构等）
 * - 认证类型（登录、用户信息等）
 * - 系统管理类型（用户、角色等）
 * - 全局命名空间声明
 *
 * ## 使用场景
 *
 * - API 请求参数类型约束
 * - API 响应数据类型定义
 * - 接口文档类型同步
 *
 * ## 注意事项
 *
 * - 在 .vue 文件使用需要在 eslint.config.mjs 中配置 globals: { Api: 'readonly' }
 * - 使用全局命名空间，无需导入即可使用
 *
 * ## 使用方式
 *
 * ```typescript
 * const params: Api.Auth.LoginParams = {
 *   identifier: 'operator@example.com',
 *   password: 'example-password'
 * }
 * const response: Api.Auth.UserInfo = await fetchUserInfo()
 * ```
 *
 * @module types/api/api
 */

declare namespace Api {
  /** 通用类型 */
  namespace Common {
    /** 分页参数 */
    interface PaginationParams {
      /** 当前页码 */
      current: number
      /** 每页条数 */
      size: number
      /** 总条数 */
      total: number
      /*适配supabase分页*/
      from?: number
      to?: number
    }

    /** 通用搜索参数 */
    type CommonSearchParams = Pick<PaginationParams, 'from' | 'to'>

    /** 分页响应基础结构 */
    interface PaginatedResponse<T = unknown> {
      records?: T[]
      current?: number
      size?: number
      total?: number
      data?: T[]
      error?: unknown
      count?: number | null
      response?: unknown
    }

    /** 启用状态 */
    type EnableStatus = '1' | '2'
    /** Element Plus Tag 预设类型 */
    type TagPreset = 'primary' | 'success' | 'info' | 'warning' | 'danger'
    /** 敏感字段统一访问级别 */
    type FieldAccessLevel = 'hidden' | 'masked' | 'read' | 'edit'
    /** 字典项保存的 Tag 类型，空值表示默认样式 */
    type TagType = '' | TagPreset
  }

  /** 认证类型 */
  namespace Auth {
    import UserListItem = Api.SystemManage.UserListItem

    /** 登录参数 */
    interface RegisterParams {
      userName?: string
      email: string
      password: string
      captchaToken?: string
    }

    interface LoginParams {
      identifier: string
      password: string
      captchaToken?: string
    }

    /** 忘记密码参数 */
    interface ForgetPwdParams {
      email: string
      redirectTo: string
    }

    /** 重置密码参数 */
    interface ResetPwdParams {
      password: string
    }

    /** 登录响应 */
    interface LoginResponse {
      token: string
      refreshToken: string
    }

    /** 登录页与个人中心共用的第三方认证渠道。敏感凭据只配置在认证服务端。 */
    interface AuthChannel {
      key: string
      label: string
      provider: string
      icon: string
      description?: string | null
      scopes?: string | null
      queryParamName?: string | null
      queryParamValue?: string | null
      enabled: boolean
      allowLinking: boolean
    }

    interface LinkedIdentity {
      id: string
      provider: string
      email?: string | null
      createdAt?: string | null
      updatedAt?: string | null
    }

    /** 用户信息 */
    type UserInfo = Partial<
      Omit<UserListItem, 'id' | 'userEmail'> & {
        userId: string
        email: string
        platformSuper: boolean
      }
    >
  }

  /** 系统管理类型 */
  namespace SystemManage {
    type UserAccountIdentityType =
      'employee' | 'external' | 'service' | 'platform' | 'pending_review'

    /** 用户列表 */
    type UserList = Api.Common.PaginatedResponse<UserListItem>

    /** 用户列表项 */
    interface UserListItem {
      id?: string
      tenantId?: string
      tenant?: Pick<TenantListItem, 'tenantCode' | 'tenantName' | 'builtinType'>
      organizationId?: string | null
      organization?: Pick<
        OrganizationListItem,
        'id' | 'organizationCode' | 'organizationName'
      > | null
      systemProtected?: boolean
      roleNames?: string[]
      accountIdentityType?: UserAccountIdentityType
      hrEmployeeId?: string | null
      hrEmployee?: {
        id: string
        tenantId?: string
        organizationId?: string | null
        employeeNo: string
        employeeName: string
        avatarUrl?: string | null
        jobTitle?: string | null
        employmentStatus: string
        gender?: string | null
        phone?: string | null
        email?: string | null
        organization?: {
          id: string
          organizationCode: string
          organizationName: string
        } | null
      } | null
      avatar?: string | null
      status?: string
      password: string
      confirmPassword: string
      userName: string
      userGender: string
      nickName: string
      userPhone: string
      userEmail: string
      userRoles: string[]
      userType?: string
      remark?: string
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
      deletedAt?: string | null
      deletedBy?: string | null
      authUserId?: string
      extra?: Record<string, unknown>
    }

    /** 用户搜索参数 */
    type UserSearchParams = Partial<
      Pick<
        UserListItem,
        | 'id'
        | 'tenantId'
        | 'organizationId'
        | 'accountIdentityType'
        | 'userName'
        | 'userGender'
        | 'userPhone'
        | 'userEmail'
        | 'status'
      > &
        Api.Common.CommonSearchParams & {
          organizationIds: string[]
          organizationUnassigned: boolean
        }
    >

    /** 角色列表 */
    type RoleList = Api.Common.PaginatedResponse<RoleListItem>

    /** 角色列表项 */
    type RoleBuiltinType = 'platform_super' | 'default_register'

    interface RoleListItem {
      id?: string
      tenantId?: string
      tenant?: Pick<TenantListItem, 'tenantCode' | 'tenantName' | 'builtinType'>
      organizationId?: string | null
      organization?: Pick<
        OrganizationListItem,
        'id' | 'organizationCode' | 'organizationName'
      > | null
      roleId?: number
      roleName: string
      roleCode: string
      builtinType?: RoleBuiltinType | null
      description?: string
      enabled?: boolean
      createTime?: string
      createBy?: string
      startTime?: string
      endTime?: string
    }

    /** 角色搜索参数 */
    type RoleSearchParams = Partial<
      Pick<
        RoleListItem,
        | 'roleId'
        | 'tenantId'
        | 'organizationId'
        | 'roleName'
        | 'roleCode'
        | 'description'
        | 'enabled'
        | 'startTime'
        | 'endTime'
      > &
        Api.Common.CommonSearchParams & {
          recordId: string
          startTime: string | null
          endTime: string | null
          organizationIds: string[]
          organizationUnassigned: boolean
        }
    >

    type FieldPermissionSubjectType = 'role' | 'user'

    interface FieldPermissionResource {
      id: string
      resourceKey: string
      resourceLabel: string
      menuName: string
      fieldCount: number
    }

    interface FieldPermissionField {
      id: string
      fieldKey: string
      fieldLabel: string
      defaultAccess: Api.Common.FieldAccessLevel
      maskStrategy?: string | null
      ownerOverrideEnabled: boolean
      inheritedAccess: Api.Common.FieldAccessLevel
      explicitAccess?: Api.Common.FieldAccessLevel | null
    }

    interface FieldPermissionConfiguration {
      resourceId: string
      resourceKey: string
      resourceLabel: string
      subjectType: FieldPermissionSubjectType
      subjectId: string
      fields: FieldPermissionField[]
    }

    interface FieldPermissionAuditLog {
      id: string
      action: 'replace' | 'clear'
      beforeValue: Record<string, Api.Common.FieldAccessLevel>
      afterValue: Record<string, Api.Common.FieldAccessLevel>
      actorName: string
      actorEmail?: string | null
      createTime: string
    }

    type OrganizationType = 'company' | 'division' | 'department' | 'team'

    interface OrganizationMember {
      id: string
      tenantId?: string
      organizationId?: string | null
      organization?: Pick<
        OrganizationListItem,
        'id' | 'organizationCode' | 'organizationName'
      > | null
      avatar?: string | null
      userName: string
      nickName?: string | null
      userEmail: string
      status?: string
      userRoles?: string[]
    }

    interface OrganizationRoleMenu {
      menuId: string
      menu?: {
        name?: string
        type?: string
        meta?: Record<string, unknown>
      } | null
    }

    interface OrganizationRole {
      id: string
      roleName: string
      roleCode: string
      enabled?: boolean
      roleMenus?: OrganizationRoleMenu[]
    }

    interface OrganizationListItem {
      id?: string
      tenantId?: string
      tenant?: Pick<TenantListItem, 'tenantCode' | 'tenantName'>
      parentId?: string | null
      organizationCode: string
      organizationName: string
      organizationType: OrganizationType
      leaderUserId?: string | null
      leader?: Pick<
        OrganizationMember,
        'id' | 'avatar' | 'userName' | 'nickName' | 'userEmail'
      > | null
      status: Api.Common.EnableStatus
      sort: number
      phone?: string | null
      email?: string | null
      address?: string | null
      description?: string | null
      isSystem?: boolean
      memberCount?: number
      roleCount?: number
      menuCount?: number
      members?: OrganizationMember[]
      roles?: OrganizationRole[]
      children?: OrganizationListItem[]
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
    }

    type OrganizationScopeFilterItem = Pick<
      OrganizationListItem,
      | 'id'
      | 'tenantId'
      | 'tenant'
      | 'parentId'
      | 'organizationCode'
      | 'organizationName'
      | 'organizationType'
      | 'status'
      | 'sort'
      | 'isSystem'
    > & {
      scopeCount?: number
      children?: OrganizationScopeFilterItem[]
    }

    type OrganizationSearchParams = Partial<
      Pick<OrganizationListItem, 'tenantId' | 'organizationType' | 'status'> & {
        keyword: string
        recordId: string
      }
    >

    type OrganizationSavePayload = Pick<
      OrganizationListItem,
      | 'tenantId'
      | 'parentId'
      | 'organizationCode'
      | 'organizationName'
      | 'organizationType'
      | 'leaderUserId'
      | 'status'
      | 'sort'
      | 'phone'
      | 'email'
      | 'address'
      | 'description'
    > & { id?: string }

    /** 租户列表项 */
    type TenantBuiltinType = 'platform' | 'public_register'

    interface TenantListItem {
      id?: string
      tenantCode: string
      tenantName: string
      builtinType?: TenantBuiltinType | null
      status?: Api.Common.EnableStatus
      serviceStartDate?: string | null
      serviceEndDate?: string | null
      remark?: string
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
    }

    /** 租户搜索参数 */
    type TenantSearchParams = Partial<
      Pick<TenantListItem, 'tenantCode' | 'tenantName' | 'status'> & Api.Common.CommonSearchParams
    >

    type SystemParamType = 'single_text' | 'multi_text' | 'number' | 'boolean' | 'json'

    interface SystemParamItem {
      id?: string
      tenantId?: string
      paramName: string
      paramKey: string
      groupCode: string
      groupName: string
      paramType: SystemParamType
      defaultValue?: string | null
      paramValue: string
      extendConfig?: Record<string, unknown>
      enabled: boolean
      builtin: boolean
      sort: number
      remark?: string | null
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
    }

    type SystemParamSearchParams = Partial<
      Pick<SystemParamItem, 'groupCode' | 'paramType'> &
        Api.Common.CommonSearchParams & {
          keyword?: string
          enabled?: boolean
          builtin?: boolean
        }
    >

    interface SystemParamStats {
      total: number
      enabled: number
      builtin: number
      groups: number
      groupCounts: Record<string, number>
      lastRefreshTime?: string
    }

    interface RegistrationRoleOption {
      id: string
      roleName: string
      roleCode: string
      builtinType?: RoleBuiltinType | null
    }

    type DocumentNumberCategory = 'business_document' | 'master_data' | 'vehicle'
    type DocumentNumberResetCycle = 'none' | 'year' | 'month' | 'day'

    interface DocumentNumberCounterItem {
      id?: string
      ruleId: string
      tenantId: string
      ruleVersion: number
      periodKey: string
      currentValue: number
      updateTime?: string
    }

    interface DocumentNumberRuleItem {
      id?: string
      tenantId: string
      tenant?: Pick<TenantListItem, 'tenantCode' | 'tenantName'> | null
      ruleKey: string
      ruleName: string
      category: DocumentNumberCategory
      targetTable: string
      targetColumn: string
      autoEnabled: boolean
      template: string
      resetCycle: DocumentNumberResetCycle
      sequenceStart: number
      timezone: string
      ruleVersion: number
      manualRequired: boolean
      builtin: boolean
      enabled: boolean
      remark?: string | null
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
      counters?: DocumentNumberCounterItem[]
      currentValue?: number | null
      currentPeriodKey?: string
      nextValue?: number
      preview?: string
      scene?: DocumentNumberSceneItem | null
    }

    interface DocumentNumberSceneItem {
      ruleKey: string
      ruleName: string
      fieldLabel: string
      category: DocumentNumberCategory
      menuId: string
      menu?: Pick<AppRouteRecord, 'id' | 'name' | 'path' | 'component' | 'parentId' | 'meta'> | null
      targetTable: string
      targetColumn: string
      defaultTemplate: string
      defaultResetCycle: DocumentNumberResetCycle
      manualRequired: boolean
      enabled: boolean
      remark?: string | null
    }

    type DocumentNumberRuleSearchParams = Partial<
      Pick<DocumentNumberRuleItem, 'tenantId' | 'category' | 'autoEnabled'> &
        Api.Common.CommonSearchParams & {
          keyword?: string
          ruleKeys?: string[]
        }
    >

    type DocumentNumberRuleUpdatePayload = Pick<
      DocumentNumberRuleItem,
      'id' | 'autoEnabled' | 'template' | 'resetCycle' | 'sequenceStart' | 'timezone' | 'remark'
    >

    interface DocumentNumberRuleCreatePayload {
      tenantIds: string[]
      scene: DocumentNumberSceneItem
      autoEnabled: boolean
      template: string
      resetCycle: DocumentNumberResetCycle
      sequenceStart: number
      timezone: string
      remark?: string | null
    }

    interface DocumentNumberRuleBatchResult {
      created: number
      updated: number
      assigned: number
    }

    interface DocumentNumberRuleStats {
      total: number
      automatic: number
      manual: number
      tenantCount: number
      categoryCounts: Record<DocumentNumberCategory, number>
      lastUpdateTime?: string
    }

    type WebsiteWatermarkContentType = 'username' | 'username_time' | 'site_name' | 'custom'
    type WebsiteCaptchaType = 'turnstile'
    type WebsiteTurnstileSize = 'normal' | 'compact' | 'flexible' | 'hidden'
    type WebsiteTurnstileTheme = 'light' | 'dark' | 'auto'
    type WebsiteDefaultLanguage = 'zh' | 'en'
    type WebsiteConfigParamMeta = Pick<
      SystemParamItem,
      | 'paramName'
      | 'paramKey'
      | 'groupCode'
      | 'groupName'
      | 'paramType'
      | 'defaultValue'
      | 'extendConfig'
      | 'enabled'
      | 'builtin'
      | 'sort'
      | 'remark'
    >

    interface WebsiteConfigItem {
      id?: string
      tenantId?: string
      paramMeta?: WebsiteConfigParamMeta
      siteName: string
      siteShortName?: string | null
      siteDescription?: string | null
      logoUrl?: string | null
      faviconUrl?: string | null
      wordmarkImageEnabled: boolean
      wordmarkLightUrl?: string | null
      wordmarkDarkUrl?: string | null
      watermarkEnabled: boolean
      watermarkContentType: WebsiteWatermarkContentType
      watermarkCustomText?: string | null
      loginTitle: string
      loginSubtitle?: string | null
      loginDescription?: string | null
      defaultLanguage: WebsiteDefaultLanguage
      captchaEnabled: boolean
      captchaType: WebsiteCaptchaType
      turnstileSiteKey: string
      turnstileSize?: WebsiteTurnstileSize
      turnstileTheme?: WebsiteTurnstileTheme
      captchaMaxAttempts: number
      captchaLockMinutes: number
      registerEnabled: boolean
      authChannels: Api.Auth.AuthChannel[]
      maintenanceEnabled: boolean
      maintenanceMessage?: string | null
      seoTitle?: string | null
      seoKeywords?: string | null
      seoDescription?: string | null
      contactEmail?: string | null
      contactPhone?: string | null
      contactAddress?: string | null
      copyrightText?: string | null
      icpRecord?: string | null
      policeRecord?: string | null
      enabled: boolean
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
    }

    type WebsiteWordmarkTheme = 'light' | 'dark'

    interface WebsiteWordmarkGenerateRequest {
      siteName: string
    }

    interface WebsiteWordmarkGenerateResponse {
      imageBase64: string
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
      model: string
      runId: string
      revisedPrompt?: string | null
      generatedAt: string
    }

    interface GeofenceConfigItem {
      id?: string
      tenantId?: string
      enabled: boolean
      loadingRadiusM: number
      unloadingRadiusM: number
      loadingAllowOutsideCheckIn: boolean
      unloadingAllowOutsideCheckIn: boolean
      autoConfirmLoading: boolean
      autoConfirmUnloading: boolean
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
    }
  }

  /** 数据中心类型 */
  namespace DataCenter {
    /** 数据字典列表项 */
    interface DictListItem {
      id?: string
      tenantId?: string
      typeId?: string
      parentId?: string | null
      cascadeParentId?: string | null
      name: string
      code: string
      status: string
      label?: string
      value: string
      i18n?: string
      i18nScope?: string
      remark?: string
      color?: string
      tagType?: Api.Common.TagType
      participatesInventoryAccounting?: boolean
      sort?: number
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
      children?: DictListItem[]
    }

    type DictTypeNodeType = 'directory' | 'dictionary'

    interface DictTypeItem {
      id?: string
      tenantId?: string
      parentId?: string | null
      cascadeParentTypeId?: string | null
      cascadeParentType?: Pick<DictTypeItem, 'id' | 'name' | 'code'> | null
      nodeType: DictTypeNodeType
      name: string
      code: string
      status: string
      sort?: number
      remark?: string
      createBy?: string
      createTime?: string
      updateBy?: string
      updateTime?: string
      children?: DictTypeItem[]
    }
    namespace Resources {
      interface Args {
        btn?: Button
        targetTenantId?: string
        handleGetResourceList?: () => void | Promise<void>
        onProgress?: (progress: UploadProgress) => void
        [key: string]: unknown
      }

      type UploadPhase =
        | 'preparing'
        | 'hashing'
        | 'checking'
        | 'uploading'
        | 'saving'
        | 'processing'
        | 'completed'
        | 'failed'

      interface UploadProgress {
        phase: UploadPhase
        processed: number
        succeeded: number
        failed: number
        total: number
        currentFileName?: string
      }

      /** 用户搜索参数 */
      type ResourceSearchParams = Partial<
        Pick<ResourceListItem, 'originName' | 'suffix'> & Api.Common.CommonSearchParams
      > & { tenantId?: string }

      interface Button {
        name: string
        label: string
        icon: string
        click?: (btn: Resources.Button, selected: ResourceListItem[]) => void
        upload?: (files: File | File[], args: Args) => void | Promise<void>
        uploadConfig?: Record<string, unknown>
        order?: number
      }

      interface ResourceListItem {
        id?: number
        tenantId?: string
        storageMode?: number
        originName?: string
        objectName?: string
        hash?: string
        mimeType?: string
        storagePath?: string
        suffix?: string
        sizeByte?: number
        sizeInfo?: string
        url?: string
      }
    }
    namespace SqlConsole {
      interface DatabaseMetadata {
        columns: ColumnMetadata[]
        schemas: string[]
        tables: TableMetadata[]
        functions: FunctionMetadata[]
        foreignKeys: ForeignKeyMetadata[]
      }

      interface TableMetadata {
        tableSchema: string
        tableName: string
        columns: Array<{
          name: string
          dataType: string
          isNullable: boolean
        }>
      }

      interface ColumnMetadata {
        tableSchema: string
        tableName: string
        columnName: string
        dataType: string
        isNullable: string
        ordinalPosition: number
      }

      interface FunctionMetadata {
        routineSchema: string
        routineName: string
        returnType: string
      }

      interface ForeignKeyMetadata {
        sourceSchema: string
        sourceTable: string
        sourceColumn: string
        targetSchema: string
        targetTable: string
        targetColumn: string
        constraintName: string
      }

      interface SqlExecuteRequest {
        query: string
      }

      interface SqlExecuteResponse {
        status: 'ok' | 'error'
        errorMessage?: string
        rows?: Array<Record<string, unknown>>
        columns?: Array<{
          name: string
          type?: string | null
          fullType?: string | null
          nullable?: boolean | null
          jsType?: string | null
          description?: string | null
          maxLength?: number | null
          precision?: number | null
          scale?: number | null
          display?: {
            title?: string | null
            width?: number | null
            align?: 'left' | 'center' | 'right' | null
          }
        }>
        commandTag?: string
        rowCount?: number
        durationMs?: number
        notices?: string[]
        warnings?: string[]
        queryText?: string
      }

      interface SqlAiGenerateRequest {
        prompt: string
        mode?: 'generate' | 'fix'
        currentSql?: string
        metadata?: DatabaseMetadata
      }

      interface SqlAiGenerateResponse {
        sql: string
        summary?: string
        warnings?: string[]
        runId?: string
        model?: string
        promptVersion?: string
        providerDurationMs?: number
        durationMs?: number
      }
    }
  }
}
