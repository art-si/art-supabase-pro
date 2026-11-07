<template>
  <ArtPageShell
    :loading="page.loading"
    :error="page.error"
    class="website-config-page"
    @retry="loadPage"
  >
    <ArtPageHeader
      title="网站配置"
      subtitle="统一维护品牌、登录体验、SEO、站点状态与对外联系资料，发布后同步影响所有公共品牌展示。"
    >
      <template #status>
        <ElTag
          :type="isReadOnly ? 'info' : hasUnsavedChanges ? 'warning' : 'success'"
          effect="light"
        >
          {{ isReadOnly ? '只读模式' : hasUnsavedChanges ? '存在待发布变更' : '配置已同步' }}
        </ElTag>
      </template>
      <template #meta>
        <div class="website-config-page__header-meta">
          <span>最近更新：{{ lastUpdateText }}</span>
          <span>更新人：{{ form.updateBy || form.createBy || 'admin' }}</span>
          <span>备用语言：{{ defaultLanguageLabel }}</span>
        </div>
      </template>
    </ArtPageHeader>

    <ArtForm
      ref="formRef"
      v-model="form"
      :items="allFormItems"
      :rules="rules"
      :disabled="isReadOnly"
      root-class="px-0! pt-0!"
      :span="8"
      :gutter="14"
    >
      <template #layout="{ fields: Fields }">
        <div class="website-config-page__body">
          <ArtSectionCard
            class="website-config-page__nav-panel"
            role="navigation"
            aria-label="网站配置分组"
            title="配置分组"
          >
            <div class="website-config-page__nav-items">
              <button
                v-for="item in navigationItems"
                :key="item.key"
                type="button"
                class="website-config-page__nav-item"
                :class="{ 'is-active': page.activeSection === item.key }"
                @click="scrollToSection(item.key)"
              >
                <ArtSvgIcon :icon="item.icon" />
                <span>{{ item.label }}</span>
              </button>
            </div>
            <template #footer>
              <div class="website-config-page__publish-tip">
                <strong>发布影响</strong>
                <p>配置保存后会立即同步到登录页、公共配置缓存和系统品牌展示。</p>
              </div>
            </template>
          </ArtSectionCard>

          <div class="website-config-page__content">
            <section id="overview" class="website-config-page__summary" aria-label="状态概览">
              <div
                v-for="item in summaryCards"
                :key="item.label"
                class="website-config-page__summary-card art-card-xs"
              >
                <div>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                  <p>{{ item.description }}</p>
                </div>
                <ArtSvgIcon :icon="item.icon" />
              </div>
            </section>

            <ArtSectionCard
              v-for="section in formSections"
              :id="section.key"
              :key="section.key"
              :title="section.title"
              :subtitle="section.description"
              class="website-config-page__section"
            >
              <template #actions>
                <ArtSvgIcon :icon="section.icon" />
              </template>

              <div class="website-config-page__section-body">
                <AuthChannelSettings
                  v-if="section.key === 'auth'"
                  v-model="form.authChannels"
                  :disabled="isReadOnly"
                  :fields-renderer="Fields"
                />
                <component
                  :is="Fields"
                  v-if="section.key !== 'auth' && section.key !== 'preview'"
                  :items="sectionFormItems[section.key]"
                  :actions="false"
                />
                <template v-if="section.key === 'preview'">
                  <div class="website-config-page__preview-grid">
                    <div>
                      <span>品牌名称</span>
                      <strong>{{ form.siteName || '-' }}</strong>
                    </div>
                    <div>
                      <span>备用语言</span>
                      <strong>{{ defaultLanguageLabel }}</strong>
                    </div>
                    <div>
                      <span>水印内容</span>
                      <strong>{{ watermarkLabel }}</strong>
                    </div>
                    <div>
                      <span>验证码</span>
                      <strong>{{ form.captchaEnabled ? captchaLabel : '已关闭' }}</strong>
                    </div>
                  </div>
                </template>
              </div>
            </ArtSectionCard>

            <ArtStickyActionBar
              class="website-config-page__actions"
              :class="{
                'is-readonly': isReadOnly,
                'is-dirty': hasUnsavedChanges
              }"
            >
              <template #summary>
                <div class="website-config-page__action-copy">
                  <div class="website-config-page__action-title">
                    <ArtSvgIcon :icon="publishState.icon" />
                    <strong>{{ publishState.title }}</strong>
                  </div>
                  <p>{{ publishState.description }}</p>
                </div>
              </template>
              <div v-if="!isReadOnly" class="website-config-page__action-buttons">
                <ElButton :disabled="!hasUnsavedChanges || page.saving" @click="resetForm">
                  撤销未发布修改
                </ElButton>
                <ElButton
                  v-auth="'System:WebsiteConfig:Publish'"
                  type="primary"
                  :disabled="!hasUnsavedChanges"
                  :loading="page.saving"
                  @click="handleSave"
                  >保存并发布配置</ElButton
                >
              </div>
              <div v-else class="website-config-page__readonly-badge">
                <ArtSvgIcon icon="ri:lock-2-line" />
                <span>仅平台超级管理员可发布</span>
              </div>
            </ArtStickyActionBar>
          </div>
        </div>
      </template>
      <template #wordmarkImageEnabled
        ><WebsiteWordmarkSettings
          :enabled="form.wordmarkImageEnabled"
          :resource-tenant-id="platformTenantId"
          :light-url="form.wordmarkLightUrl"
          :dark-url="form.wordmarkDarkUrl"
          :site-name="form.siteName"
          :disabled="isReadOnly"
          @update:enabled="form.wordmarkImageEnabled = $event"
          @update:light-url="form.wordmarkLightUrl = $event"
          @update:dark-url="form.wordmarkDarkUrl = $event"
      /></template>
    </ArtForm>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { getScrollBehavior } from '@/utils/ui/scroll'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage, type FormRules } from 'element-plus'
  import { cloneDeep, isEqual, omit } from 'lodash-es'
  import { useEventListener } from '@vueuse/core'
  import { fetchResourceCapabilities, type ResourceCapabilities } from '@/api/data-center'
  import { fetchWebsiteConfig, saveWebsiteConfig } from '@/api/system-manage/website-config'
  import { createWebsiteConfigDefaults } from '@/config/website-config-defaults'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { getPageScrollContainer } from '@/hooks/core/useCommon'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import AuthChannelSettings from './modules/auth-channel-settings.vue'
  import { createAuthChannelFormItems } from './modules/auth-channel-form-items'
  import WebsiteWordmarkSettings from './modules/website-wordmark-settings.vue'
  import { getAuthChannelValidationMessage, normalizeAuthChannels } from '@/utils/supabase'

  defineOptions({ name: 'WebsiteConfig' })

  type WebsiteConfig = Api.SystemManage.WebsiteConfigItem
  type SectionKey = 'overview' | 'identity' | 'login' | 'auth' | 'seo' | 'contact' | 'preview'

  interface NavigationItem {
    key: SectionKey
    label: string
    icon: string
  }

  interface FormSection extends NavigationItem {
    title: string
    description: string
  }

  interface PageGroup {
    activeSection: SectionKey
    loading: boolean
    saving: boolean
    error: Error | null
    canPublish: boolean
    resources: ResourceCapabilities
  }

  const formRef = ref<InstanceType<typeof ArtForm>>()
  const page = reactive<PageGroup>({
    activeSection: 'identity',
    loading: false,
    saving: false,
    error: null,
    canPublish: false,
    resources: { canView: false, canUpload: false, canRename: false, canDelete: false }
  })
  const form = ref<WebsiteConfig>(createWebsiteConfigDefaults())
  const originalForm = ref<WebsiteConfig>(createWebsiteConfigDefaults())
  const pageScrollContainer = shallowRef<HTMLElement | null>(null)
  const { setWebsiteConfig, loadWebsiteConfig } = useWebsiteConfig()
  const userStore = useUserStore()
  const platformTenantId = computed(() => userStore.getUserInfo.tenantId || '')
  const isReadOnly = computed(() => !page.canPublish)
  const hasUnsavedChanges = computed(
    () => !isEqual(normalizePayload(form.value), normalizePayload(originalForm.value))
  )
  const publishState = computed(() => {
    if (isReadOnly.value) {
      return {
        title: '当前为只读查看',
        description: '你可以浏览全部站点配置，但发布权限仅向平台超级管理员开放。',
        icon: 'ri:shield-keyhole-line'
      }
    }
    if (hasUnsavedChanges.value) {
      return {
        title: '存在未发布修改',
        description: '请检查发布预览；保存后会同步影响登录页、浏览器标题与系统品牌展示。',
        icon: 'ri:draft-line'
      }
    }
    return {
      title: `${form.value.siteName || '网站配置'}已同步`,
      description: '当前表单与线上配置一致，可继续编辑后再统一发布。',
      icon: 'ri:checkbox-circle-line'
    }
  })

  const navigationItems: NavigationItem[] = [
    { key: 'overview', label: '状态概览', icon: 'ri:pulse-line' },
    { key: 'identity', label: '系统标识', icon: 'ri:dashboard-line' },
    { key: 'login', label: '登录体验', icon: 'ri:shield-user-line' },
    { key: 'auth', label: '认证渠道', icon: 'ri:login-box-line' },
    { key: 'seo', label: 'SEO 展现', icon: 'ri:search-eye-line' },
    { key: 'contact', label: '联系合规', icon: 'ri:file-copy-2-line' },
    { key: 'preview', label: '发布预览', icon: 'ri:edit-box-line' }
  ]

  const formSections: FormSection[] = [
    {
      key: 'identity',
      label: '系统标识',
      icon: 'ri:dashboard-line',
      title: '系统标识',
      description: '配置系统名称、简称与公共水印内容。'
    },
    {
      key: 'login',
      label: '登录体验',
      icon: 'ri:shield-user-line',
      title: '登录体验',
      description: '控制登录欢迎文案、验证码、安全锁定、默认语言、维护模式与注册策略。'
    },
    {
      key: 'auth',
      label: '认证渠道',
      icon: 'ri:login-box-line',
      title: '多渠道认证',
      description: '管理登录页与个人中心可用的 OAuth/OIDC 渠道；敏感凭据始终留在认证服务端。'
    },
    {
      key: 'seo',
      label: 'SEO 展现',
      icon: 'ri:search-eye-line',
      title: 'SEO 与搜索展现',
      description: '用于浏览器标题、搜索摘要和对外品牌检索。'
    },
    {
      key: 'contact',
      label: '联系合规',
      icon: 'ri:file-copy-2-line',
      title: '联系与合规信息',
      description: '配置对外联系方式、地址与备案文案，便于后续扩展官网或登录页页脚。'
    },
    {
      key: 'preview',
      label: '发布预览',
      icon: 'ri:edit-box-line',
      title: '发布预览',
      description: '保存前快速确认即将影响公共展示的核心配置。'
    }
  ]

  const languageOptions = useDictionaryOptions('sysWebsiteLanguage')
  const watermarkOptions = useDictionaryOptions('sysWatermarkContentType')
  const captchaDictionaryOptions = useDictionaryOptions('sysCaptchaProvider')
  const captchaOptions = computed(() =>
    captchaDictionaryOptions.filter((item) => item.value === 'turnstile')
  )
  const turnstileSizeOptions = useDictionaryOptions('sysTurnstileSize')
  const turnstileThemeOptions = useDictionaryOptions('sysTurnstileTheme')

  const rules: FormRules<WebsiteConfig> = {
    siteName: [{ required: true, message: '请输入系统名称', trigger: 'blur' }],
    wordmarkImageEnabled: [
      {
        validator: (_rule, value, callback) => {
          if (
            value &&
            (!form.value.wordmarkLightUrl?.trim() || !form.value.wordmarkDarkUrl?.trim())
          ) {
            callback(new Error('启用品牌字图后，请同时配置亮色和暗色字图'))
            return
          }
          callback()
        },
        trigger: 'change'
      }
    ],
    loginTitle: [{ required: true, message: '请输入登录欢迎标题', trigger: 'blur' }],
    watermarkContentType: [{ required: true, message: '请选择水印内容', trigger: 'change' }],
    captchaType: [{ required: true, message: '请选择验证码类型', trigger: 'change' }],
    turnstileSiteKey: [
      {
        validator: (_rule, value, callback) => {
          if (form.value.captchaEnabled && !String(value || '').trim()) {
            callback(new Error('请输入 Turnstile Site Key'))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ],
    defaultLanguage: [{ required: true, message: '请选择默认语言', trigger: 'change' }],
    maintenanceMessage: [
      {
        validator: (_rule, value, callback) => {
          if (form.value.maintenanceEnabled && !String(value || '').trim()) {
            callback(new Error('开启维护模式后，请填写维护提示文案'))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ]
  }

  const lastUpdateText = computed(() =>
    form.value.updateTime || form.value.createTime
      ? formatWithDayjs(form.value.updateTime || form.value.createTime)
      : '-'
  )

  const defaultLanguageLabel = computed(
    () => languageOptions.find((item) => item.value === form.value.defaultLanguage)?.label || '-'
  )

  const watermarkLabel = computed(
    () =>
      watermarkOptions.find((item) => item.value === form.value.watermarkContentType)?.label || '-'
  )

  const captchaLabel = computed(
    () => captchaOptions.value.find((item) => item.value === form.value.captchaType)?.label || '-'
  )

  const summaryCards = computed(() => [
    {
      label: '站点状态',
      value: form.value.maintenanceEnabled ? '维护模式已开启' : '正常运行',
      description: form.value.maintenanceEnabled
        ? '登录页将展示维护公告。'
        : '登录页将按常规流程展示。',
      icon: form.value.maintenanceEnabled ? 'ri:alarm-warning-line' : 'ri:sun-line'
    },
    {
      label: '开放注册',
      value: form.value.registerEnabled ? '已开启' : '已关闭',
      description: form.value.registerEnabled
        ? '新用户可从登录页进入注册流程。'
        : '登录页不展示注册入口。',
      icon: 'ri:user-add-line'
    },
    {
      label: '登录验证',
      value: form.value.captchaEnabled ? captchaLabel.value : '未启用',
      description: form.value.captchaEnabled
        ? '登录页将要求完成人机验证。'
        : '登录页不会显示验证码。',
      icon: 'ri:shield-check-line'
    },
    {
      label: '品牌名称',
      value: form.value.siteName || '-',
      description: '影响登录页、标题、水印和系统品牌展示。',
      icon: 'ri:bookmark-3-line'
    }
  ])

  const setForm = (config: WebsiteConfig): void => {
    Object.assign(form.value, createWebsiteConfigDefaults(), config, {
      turnstileSize: config.turnstileSize === 'flexible' ? 'hidden' : config.turnstileSize,
      authChannels: normalizeAuthChannels(config.authChannels)
    })
    originalForm.value = cloneDeep(form.value)
  }

  const fetchConfig = async (): Promise<void> => {
    const [{ data, canPublish }, resources] = await Promise.all([
      fetchWebsiteConfig(),
      fetchResourceCapabilities()
    ])
    page.resources = resources
    page.canPublish = canPublish
    setForm({
      ...createWebsiteConfigDefaults(),
      ...(data ?? {})
    })
  }

  const normalizePayload = (config = form.value): WebsiteConfig => {
    const payload = omit(cloneDeep(config), [
      'tenantId',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime'
    ])
    return {
      ...payload,
      authChannels: normalizeAuthChannels(payload.authChannels),
      siteShortName: normalizeNullableText(payload.siteShortName),
      siteDescription: normalizeNullableText(payload.siteDescription),
      logoUrl: normalizeNullableText(payload.logoUrl),
      faviconUrl: normalizeNullableText(payload.faviconUrl),
      wordmarkLightUrl: normalizeNullableText(payload.wordmarkLightUrl),
      wordmarkDarkUrl: normalizeNullableText(payload.wordmarkDarkUrl),
      watermarkCustomText: normalizeNullableText(payload.watermarkCustomText),
      loginSubtitle:
        normalizeNullableText(payload.loginSubtitle) ??
        normalizeNullableText(payload.loginDescription),
      loginDescription: normalizeNullableText(payload.loginDescription),
      turnstileSiteKey: normalizeNullableText(payload.turnstileSiteKey),
      turnstileSize: payload.turnstileSize || 'normal',
      turnstileTheme: payload.turnstileTheme || 'auto',
      maintenanceMessage: normalizeNullableText(payload.maintenanceMessage),
      seoTitle: normalizeNullableText(payload.seoTitle),
      seoKeywords: normalizeNullableText(payload.seoKeywords),
      seoDescription: normalizeNullableText(payload.seoDescription),
      contactEmail: normalizeNullableText(payload.contactEmail),
      contactPhone: normalizeNullableText(payload.contactPhone),
      contactAddress: normalizeNullableText(payload.contactAddress),
      copyrightText: normalizeNullableText(payload.copyrightText),
      icpRecord: normalizeNullableText(payload.icpRecord),
      policeRecord: normalizeNullableText(payload.policeRecord),
      captchaMaxAttempts: Number(payload.captchaMaxAttempts || 0),
      captchaLockMinutes: Number(payload.captchaLockMinutes || 0),
      enabled: true
    } as WebsiteConfig
  }

  const handleSave = async (): Promise<void> => {
    if (page.saving) return
    if (isReadOnly.value) {
      ElMessage.warning('当前账号只有查看权限，不能保存网站配置')
      return
    }
    if (!hasUnsavedChanges.value) {
      ElMessage.info('当前配置没有需要发布的变更')
      return
    }
    const authChannelError = getAuthChannelValidationMessage(form.value.authChannels)
    if (authChannelError) {
      ElMessage.warning(authChannelError)
      scrollToSection('auth')
      return
    }

    page.saving = true

    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return
      const payload = normalizePayload()
      const result = await saveWebsiteConfig(payload)
      if (result.error) {
        notifyFriendlyError(result.error, '网站配置发布失败，当前输入已保留，请稍后重试')
        return
      }
      await fetchConfig()
      setWebsiteConfig(form.value)
      await loadWebsiteConfig(true)
      ElMessage.success('网站配置已发布')
    } catch (error) {
      notifyFriendlyError(error, '网站配置发布失败，当前输入已保留，请稍后重试')
    } finally {
      page.saving = false
    }
  }

  const resetForm = (): void => {
    setForm(originalForm.value)
    void formRef.value?.clearValidate()
  }

  const scrollToSection = (key: SectionKey): void => {
    const target = document.getElementById(key)
    if (!target) return
    page.activeSection = key
    const scrollContainer = getPageScrollContainer()
    if (!scrollContainer) {
      target.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' })
      return
    }

    const targetTop = target.getBoundingClientRect().top
    const containerTop = scrollContainer.getBoundingClientRect().top
    const scrollMarginTop = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0
    scrollContainer.scrollTo({
      top: Math.max(scrollContainer.scrollTop + targetTop - containerTop - scrollMarginTop, 0),
      behavior: getScrollBehavior()
    })
  }

  const getSectionElements = (): Array<{ key: SectionKey; element: HTMLElement }> => {
    return navigationItems.flatMap(({ key }) => {
      const element = document.getElementById(key)
      return element ? [{ key, element }] : []
    })
  }

  const syncActiveSection = (): void => {
    const scrollContainer = pageScrollContainer.value
    const sections = getSectionElements()
    if (!scrollContainer || sections.length === 0) return

    const isAtBottom =
      scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2
    if (isAtBottom) {
      page.activeSection = sections.at(-1)?.key ?? page.activeSection
      return
    }

    const containerTop = scrollContainer.getBoundingClientRect().top
    const scrollMarginTop = Number.parseFloat(getComputedStyle(sections[0].element).scrollMarginTop)
    const activationLine =
      containerTop + (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0) + 1

    let activeSection = sections[0].key
    for (const section of sections) {
      if (section.element.getBoundingClientRect().top > activationLine) break
      activeSection = section.key
    }
    page.activeSection = activeSection
  }

  let activeSectionFrame: number | undefined
  const scheduleActiveSectionSync = (): void => {
    if (activeSectionFrame !== undefined) return
    activeSectionFrame = window.requestAnimationFrame(() => {
      activeSectionFrame = undefined
      syncActiveSection()
    })
  }

  useEventListener(pageScrollContainer, 'scroll', scheduleActiveSectionSync, { passive: true })

  const loadPage = async (): Promise<void> => {
    page.loading = true
    page.error = null
    try {
      await fetchConfig()
      await nextTick()
      pageScrollContainer.value = getPageScrollContainer()
      syncActiveSection()
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('网站配置加载失败')
    } finally {
      page.loading = false
    }
  }

  onMounted(() => void loadPage())

  onBeforeUnmount(() => {
    if (activeSectionFrame !== undefined) window.cancelAnimationFrame(activeSectionFrame)
  })

  const sectionFormItems = computed<Record<SectionKey, FormItem[]>>(() => ({
    overview: [],
    preview: [],
    auth: [],
    identity: [
      {
        key: 'siteName',
        label: '系统名称',
        type: 'input',
        description: '用于登录页、顶部栏、侧边栏、页面标题和系统品牌展示。',
        props: { maxlength: '60', showWordLimit: true, modelModifiers: { trim: true } }
      },
      {
        key: 'siteShortName',
        label: '系统简称',
        type: 'input',
        description: '用于空间受限的紧凑场景；菜单品牌文字和 AI 字图均以系统名称为准。',
        props: { maxlength: '40', modelModifiers: { trim: true } }
      },
      {
        key: 'watermarkContentType',
        label: '水印内容',
        type: 'select',
        description: '默认使用当前登录用户名，也可切换为站点名称或自定义文本。',
        options: watermarkOptions
      },
      {
        key: 'watermarkCustomText',
        label: '自定义水印',
        type: 'input',
        hidden: form.value.watermarkContentType !== 'custom',
        props: { maxlength: '80', modelModifiers: { trim: true } }
      },
      {
        key: 'siteDescription',
        label: '站点简介',
        type: 'textarea',
        span: 24,
        props: { resize: 'none', maxlength: '255', showWordLimit: true, rows: 3 }
      },
      {
        key: 'wordmarkImageEnabled',
        label: '菜单品牌字图',
        type: 'wordmarkSettings',
        span: 24
      },
      {
        key: 'watermarkEnabled',
        label: '启用水印',
        type: 'switch',
        span: 24,
        description: '保存后作为站点级水印配置生效；用户仍可在个性化设置中临时隐藏。'
      }
    ],
    login: [
      {
        key: 'loginTitle',
        label: '登录欢迎标题',
        type: 'input',
        props: { maxlength: '80', modelModifiers: { trim: true } }
      },
      { key: 'defaultLanguage', label: '备用默认语言', type: 'select', options: languageOptions },
      {
        key: 'loginDescription',
        label: '登录欢迎描述',
        type: 'textarea',
        span: 24,
        props: { resize: 'vertical', maxlength: '255', showWordLimit: true, rows: 4 }
      },
      {
        key: 'captchaEnabled',
        label: '登录验证',
        type: 'switch',
        description: '开启后显示 Turnstile，并由 Supabase Auth 校验验证结果。'
      },
      {
        key: 'registerEnabled',
        label: '开放注册',
        type: 'switch',
        description: '关闭后，登录页和注册入口不再提供公开注册入口。'
      },
      {
        key: 'maintenanceEnabled',
        label: '维护模式',
        type: 'switch',
        description: '开启后，登录页展示维护公告，用于版本升级或临时停服窗口。'
      },
      {
        key: 'captchaType',
        label: '验证码类型',
        type: 'select',
        description: 'Turnstile 用于拦截机器人登录请求。',
        options: captchaOptions.value,
        hidden: !form.value.captchaEnabled
      },
      {
        key: 'turnstileSiteKey',
        label: 'Turnstile Site Key',
        type: 'input',
        description: 'Secret Key 仅配置在 Supabase Auth 后台，请勿填写在此处。',
        hidden: !form.value.captchaEnabled,
        props: {
          maxlength: '120',
          placeholder: '请输入 Turnstile Site Key',
          modelModifiers: { trim: true }
        }
      },
      {
        key: 'turnstileSize',
        label: '组件尺寸',
        type: 'select',
        options: turnstileSizeOptions,
        hidden: !form.value.captchaEnabled
      },
      {
        key: 'turnstileTheme',
        label: '显示主题',
        type: 'select',
        options: turnstileThemeOptions,
        hidden: !form.value.captchaEnabled
      },
      {
        key: 'captchaMaxAttempts',
        label: '最大失败次数',
        type: 'number',
        description: '设置为 0 表示不限制。',
        hidden: !form.value.captchaEnabled,
        props: { min: 0, max: 20, controlsPosition: 'right' }
      },
      {
        key: 'captchaLockMinutes',
        label: '锁定时间（分钟）',
        type: 'number',
        hidden: !form.value.captchaEnabled,
        props: { min: 0, max: 1440, controlsPosition: 'right' }
      },
      {
        key: 'maintenanceMessage',
        label: '维护提示文案',
        type: 'input',
        span: 24,
        description: '开启维护模式后，请填写维护提示文案',
        hidden: !form.value.maintenanceEnabled,
        props: {
          maxlength: '160',
          placeholder: '维护模式开启时建议填写，例如：系统今晚 23:00-24:00 升级维护',
          modelModifiers: { trim: true }
        }
      }
    ],
    seo: [
      {
        key: 'seoTitle',
        label: 'SEO 标题',
        type: 'input',
        props: { maxlength: '80', modelModifiers: { trim: true } }
      },
      {
        key: 'seoKeywords',
        label: 'SEO 关键字',
        type: 'input',
        props: { maxlength: '160', modelModifiers: { trim: true } }
      },
      {
        key: 'seoDescription',
        label: 'SEO 描述',
        type: 'textarea',
        span: 24,
        props: { resize: 'vertical', maxlength: '500', showWordLimit: true, rows: 4 }
      },
      {
        key: 'logoUrl',
        label: 'Logo',
        type: 'uploadImage',
        props: {
          resourceTenantId: platformTenantId.value,
          resourceCanView: page.resources.canView,
          resourceCanUpload: page.resources.canUpload,
          resourceCanEdit: page.resources.canRename,
          resourceCanDelete: page.resources.canDelete,
          title: '上传 Logo',
          size: 120,
          limit: 1,
          readonly: isReadOnly.value
        }
      },
      {
        key: 'faviconUrl',
        label: 'Favicon',
        type: 'uploadImage',
        props: {
          resourceTenantId: platformTenantId.value,
          resourceCanView: page.resources.canView,
          resourceCanUpload: page.resources.canUpload,
          resourceCanEdit: page.resources.canRename,
          resourceCanDelete: page.resources.canDelete,
          title: '上传 Favicon',
          size: 120,
          limit: 1,
          readonly: isReadOnly.value,
          fileType: 'image/*,.ico'
        }
      }
    ],
    contact: [
      {
        key: 'contactEmail',
        label: '联系邮箱',
        type: 'input',
        props: { placeholder: '如：support@example.com', modelModifiers: { trim: true } }
      },
      {
        key: 'contactPhone',
        label: '联系电话',
        type: 'input',
        props: { placeholder: '如：400-800-9000', modelModifiers: { trim: true } }
      },
      {
        key: 'contactAddress',
        label: '联系地址',
        type: 'input',
        span: 24,
        props: { placeholder: '如：广东省深圳市南山区科技园', modelModifiers: { trim: true } }
      },
      {
        key: 'copyrightText',
        label: '版权文案',
        type: 'input',
        span: 24,
        props: { modelModifiers: { trim: true } }
      },
      {
        key: 'icpRecord',
        label: 'ICP备案号',
        type: 'input',
        props: { placeholder: '如：粤ICP备 2026000000 号-1', modelModifiers: { trim: true } }
      },
      {
        key: 'policeRecord',
        label: '公安备案号',
        type: 'input',
        props: { placeholder: '如：粤公网安备 44030002000001 号', modelModifiers: { trim: true } }
      }
    ]
  }))
  const allFormItems = computed<FormItem[]>(() => [
    ...Object.values(sectionFormItems.value).flat(),
    ...form.value.authChannels.flatMap((_channel, index) =>
      createAuthChannelFormItems(index, isReadOnly.value)
    )
  ])
</script>

<style scoped lang="scss">
  .website-config-page {
    --website-config-sticky-top: calc(104px + var(--art-space-4));

    display: flex;
    flex-direction: column;
    gap: var(--art-space-4);
    padding-bottom: var(--art-space-4);

    :deep(> .art-async-state) {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-4);
    }

    &__header-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-1) var(--art-space-4);
    }

    &__summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      scroll-margin-top: calc(var(--website-config-sticky-top) + var(--art-space-2));
    }

    &__summary-card {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      min-height: 84px;
      padding: 16px 18px;

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        display: block;
        margin: 8px 0 6px;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }

      .art-svg-icon {
        flex: none;
        margin-top: 2px;
        font-size: 20px;
        color: var(--el-color-primary);
      }
    }

    &__body {
      display: grid;
      grid-template-columns: 184px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    &__nav-panel {
      position: sticky;
      top: var(--website-config-sticky-top);
      max-height: calc(100dvh - var(--website-config-sticky-top) - var(--art-page-padding));
    }

    &__nav-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    &__nav-item {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;
      height: 34px;
      padding: 0 8px;
      font-size: 14px;
      color: var(--el-text-color-regular);
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--art-control-radius);

      .art-svg-icon {
        font-size: 16px;
      }

      &:hover,
      &.is-active {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
    }

    &__publish-tip {
      padding: 12px;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);

      strong {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    &__section {
      scroll-margin-top: calc(var(--website-config-sticky-top) + var(--art-space-2));

      .art-svg-icon {
        flex: none;
        font-size: 20px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__section-body {
      min-width: 0;

      :deep(.el-form-item) {
        display: block;
        margin-bottom: var(--art-space-4);

        &.is-wide {
          grid-column: 1 / -1;
        }

        &.is-error-lite {
          .el-input__wrapper {
            box-shadow: 0 0 0 1px var(--el-color-danger) inset;
          }
        }

        .el-form-item__label {
          justify-content: flex-start;
          height: 22px;
          padding: 0;
          margin-bottom: 8px;
          line-height: 22px;
        }

        .el-form-item__content {
          display: block;
        }

        .el-select,
        .el-input-number {
          width: 100%;
        }

        p {
          margin: 6px 0 0;
          font-size: 12px;
          line-height: 1.7;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__switch-row {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-height: 56px;
      padding: 12px 14px;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);

      strong {
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
      }
    }

    &__preview-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-column: 1 / -1;
      gap: 12px;

      div {
        min-height: 64px;
        padding: 12px 14px;
        background: var(--el-fill-color-blank);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--art-control-radius);
      }

      span {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }

    &__actions {
      min-height: 64px;

      .art-svg-icon {
        flex: none;
        font-size: 16px;
        color: var(--el-color-primary);
      }
    }

    &__action-copy {
      min-width: 0;

      p {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__action-title {
      display: flex;
      gap: 8px;
      align-items: center;

      strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }
    }

    &__action-buttons {
      display: flex;
      flex: none;
      gap: 10px;
    }

    &__readonly-badge {
      display: inline-flex;
      flex: none;
      gap: 7px;
      align-items: center;
      min-height: 32px;
      padding: 0 12px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 999px;

      .art-svg-icon {
        color: var(--el-text-color-secondary);
      }
    }

    &__actions.is-dirty {
      border-color: color-mix(in srgb, var(--el-color-warning) 26%, transparent) !important;

      .website-config-page__action-title .art-svg-icon {
        color: var(--el-color-warning-dark-2);
      }
    }
  }

  @media (width <= 1200px) {
    .website-config-page {
      &__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__section-body,
      &__preview-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 900px) {
    .website-config-page {
      &__body {
        grid-template-columns: 1fr;
      }

      &__nav-panel {
        position: static;
        max-height: none;
      }

      &__nav-items {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 640px) {
    .website-config-page {
      gap: var(--art-space-3);

      :deep(> .art-async-state) {
        gap: var(--art-space-3);
      }

      &__nav-panel :deep(.art-section-card__header),
      &__nav-panel :deep(.art-section-card__footer) {
        display: none;
      }

      &__nav-panel.art-section-card.is-scrollable :deep(.art-section-card__body) {
        padding-top: var(--art-space-4);
      }

      &__nav-items {
        display: flex;
        flex-direction: row;
        gap: var(--art-space-1);
        width: max-content;
      }

      &__nav-item {
        flex: 0 0 auto;
        width: auto;
        min-height: 40px;
        padding-inline: 12px;
        white-space: nowrap;
      }

      &__publish-tip {
        display: none;
      }

      &__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--art-space-2);
      }

      &__summary-card {
        min-height: 78px;
        padding: 12px;

        strong {
          margin: 5px 0 0;
          font-size: 15px;
          overflow-wrap: anywhere;
        }

        p {
          display: none;
        }

        .art-svg-icon {
          font-size: 18px;
        }
      }

      &__section-body,
      &__preview-grid {
        grid-template-columns: 1fr;
      }

      &__content {
        gap: var(--art-space-3);
      }

      &__action-buttons {
        flex-wrap: wrap;
        justify-content: flex-start;
      }

      &__actions.is-readonly {
        position: static;
        box-shadow: none !important;
        backdrop-filter: none;
      }
    }
  }
</style>
