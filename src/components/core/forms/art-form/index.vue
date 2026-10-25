<!-- 表单组件 -->
<!-- 支持常用表单组件、自定义组件、插槽、校验、隐藏表单项 -->
<!-- 写法同 ElementPlus 官方文档组件，把属性写在 props 里面就可以了 -->
<template>
  <section
    :class="[
      'art-form px-4 pb-0 pt-4 md:px-4 md:pt-4',
      { 'art-form--custom-layout': customLayout },
      { 'art-form--overlay-focus': overlayFocus?.focusMode.value },
      { 'art-form--expanded': enableExpand && isExpanded },
      rootClass
    ]"
  >
    <ElForm
      ref="formRef"
      :class="formClass"
      :model="modelValue"
      :rules="props.rules"
      :label-position="effectiveLabelPosition"
      :disabled="props.disabled"
      :validate-on-rule-change="props.validateOnRuleChange"
      v-bind="{ ...$attrs }"
      @validate="handleValidate"
      @submit.prevent="handleSubmit"
    >
      <slot v-if="customLayout" :model-value="modelValue" />
      <ElRow v-else class="flex flex-wrap" :gutter="effectiveGutter">
        <ElCol
          v-for="item in visibleFormItems"
          :key="item.key"
          v-show="!isFormItemCollapsed(item)"
          :xs="getColSpan(getItemSpan(item), 'xs')"
          :sm="getColSpan(getItemSpan(item), 'sm')"
          :md="getColSpan(getItemSpan(item), 'md')"
          :lg="getColSpan(getItemSpan(item), 'lg')"
          :xl="getColSpan(getItemSpan(item), 'xl')"
        >
          <ArtSectionTitle
            v-if="isDividerItem(item)"
            :show-line="getDividerShowLine(item)"
            :show-label="getDividerShowLabel(item)"
            :show-marker="getDividerShowMarker(item)"
            :collapsible="isDividerCollapsible(item)"
            :expanded="!isSectionCollapsed(item.key)"
            :accessible-label="getDividerAccessibleLabel(item)"
            @toggle="toggleSection(item.key)"
          >
            <template #default>
              <slot
                :name="item.key"
                :item="item"
                :modelValue="modelValue"
                :value="getFieldValue(item.key)"
                :setValue="createSlotSetValue(item)"
                :clearValue="createSlotClearValue(item)"
              >
                <component v-if="typeof item.label !== 'string'" :is="item.label" />
                <span v-else>{{ item.label }}</span>
              </slot>
            </template>
            <template v-if="$slots[`${item.key}Actions`]" #actions>
              <slot :name="`${item.key}Actions`" :item="item" :modelValue="modelValue" />
            </template>
          </ArtSectionTitle>
          <ElFormItem v-else :prop="item.key" :label-width="getFormItemLabelWidth(item)">
            <template #label v-if="item.label">
              <span class="art-form-item__label">
                <component v-if="typeof item.label !== 'string'" :is="item.label" />
                <ArtTooltip
                  v-else-if="overlayFocus?.focusMode.value"
                  :content="item.label"
                  :visible="activeLabelTooltipKey === item.key"
                  :enterable="false"
                  placement="top"
                  popper-class="art-form-item__label-tooltip"
                >
                  <span
                    class="art-form-item__label-text"
                    @mouseenter="showOverflowLabelTooltip($event, item.key)"
                    @mouseleave="hideOverflowLabelTooltip(item.key)"
                  >
                    {{ item.label }}
                  </span>
                </ArtTooltip>
                <span v-else>{{ item.label }}</span>
                <ArtTooltip v-if="item.help" placement="top" effect="dark">
                  <template #content>
                    <component v-if="typeof item.help !== 'string'" :is="item.help" />
                    <span v-else class="whitespace-pre-line">{{ item.help }}</span>
                  </template>
                  <ElIcon class="art-form-item__help-icon" aria-label="查看帮助信息" tabindex="0">
                    <QuestionFilled />
                  </ElIcon>
                </ArtTooltip>
              </span>
            </template>
            <div class="art-form-item__content">
              <slot
                :name="item.key"
                :item="item"
                :modelValue="modelValue"
                :value="getFieldValue(item.key)"
                :setValue="createSlotSetValue(item)"
                :clearValue="createSlotClearValue(item)"
              >
                <span
                  v-if="isTextItem(item)"
                  class="art-form-item__text"
                  :class="getTextClass(item)"
                >
                  {{ getTextDisplayValue(item) }}
                </span>
                <ArtAsyncState
                  v-else-if="!item.render && !componentMap"
                  size="compact"
                  loading-mode="skeleton"
                  :skeleton-rows="1"
                  :min-height="36"
                  :loading="componentsLoading"
                  :error="componentLoadErrorMessage"
                  error-title="控件加载失败"
                  :retryable="componentLoadAttempts < 2"
                  @retry="loadFormComponents()"
                />
                <component
                  v-else
                  :is="getComponent(item)"
                  :model-value="getFieldValue(item.key)"
                  @update:model-value="setFieldValue(item.key, $event, item)"
                  v-bind="getComponentProps(item)"
                >
                  <!-- 下拉选择 -->
                  <template v-if="item.type === 'select' && getOptions(item).length">
                    <template v-for="option in getOptions(item)" :key="option.value">
                      <ElOption
                        v-if="item.optionComponent"
                        v-bind="option"
                        :label="option.label"
                        :value="option.value"
                      >
                        <component :is="item.optionComponent" :option="option" />
                      </ElOption>
                      <ElOption
                        v-else
                        v-bind="option"
                        :label="option.label"
                        :value="option.value"
                      />
                    </template>
                  </template>

                  <!-- 复选框组 -->
                  <template v-if="item.type === 'checkboxGroup' && getOptions(item).length">
                    <component
                      :is="getProps(item).optionType === 'button' ? ElCheckboxButton : ElCheckbox"
                      v-for="option in getOptions(item)"
                      v-bind="option"
                      :disabled="isFieldDisabled(item) || option.disabled"
                      :key="option.value"
                    />
                  </template>

                  <!-- 单选框组 -->
                  <template v-if="item.type === 'radioGroup' && getOptions(item).length">
                    <component
                      :is="getProps(item).optionType === 'button' ? ElRadioButton : ElRadio"
                      v-for="option in getOptions(item)"
                      v-bind="option"
                      :disabled="isFieldDisabled(item) || option.disabled"
                      :key="option.value"
                    />
                  </template>

                  <template v-if="hasPickerEmptySlot(item) && !getSlots(item).empty" #empty>
                    <ArtPickerEmpty :title="getPickerEmptyTitle(item)" />
                  </template>

                  <!-- 动态插槽支持 -->
                  <template
                    v-for="(slotFn, slotName) in getSlots(item)"
                    :key="slotName"
                    #[slotName]
                  >
                    <component :is="slotFn" />
                  </template>
                </component>
              </slot>

              <ArtAsyncState
                v-if="asyncErrorMap[item.key]"
                size="compact"
                :error="asyncErrorMap[item.key]"
                error-title="选项加载失败"
                @retry="fetchOptions(item)"
              />
              <div v-if="item.description" class="art-form-item__description">
                <component v-if="typeof item.description !== 'string'" :is="item.description" />
                <span v-else class="whitespace-pre-line">{{ item.description }}</span>
              </div>
            </div>
          </ElFormItem>
        </ElCol>
        <ElCol
          :xs="getActionColSpan('xs')"
          :sm="getActionColSpan('sm')"
          :md="getActionColSpan('md')"
          :lg="getActionColSpan('lg')"
          :xl="getActionColSpan('xl')"
          class="max-w-full"
        >
          <div
            class="mb-3 flex-c flex-wrap justify-end md:flex-row md:items-stretch md:gap-2"
            :style="actionButtonsStyle"
          >
            <div class="flex gap-2 md:justify-center">
              <ElButton
                v-if="showReset"
                class="reset-button"
                :disabled="props.disabled || !formControlsReady"
                :loading="resetLoading"
                @click="handleReset"
                v-ripple
              >
                <ElIcon>
                  <RefreshLeft />
                </ElIcon>
                {{ resetText || t('table.form.reset') }}
              </ElButton>
              <ElButton
                v-if="showSubmit"
                type="primary"
                class="submit-button"
                @click="handleSubmit"
                v-ripple
                :disabled="props.disabled || disabledSubmit || hasBlockingFields"
                :loading="submitLoading"
              >
                <ElIcon>
                  <Search />
                </ElIcon>
                {{ submitText || t('table.form.submit') }}
              </ElButton>
            </div>
            <button
              v-if="shouldShowExpandToggle"
              type="button"
              class="art-form__filter-toggle"
              :aria-expanded="isExpanded"
              @click="toggleExpand"
            >
              <span>{{ expandToggleText }}</span>
              <div class="art-form__filter-toggle-icon">
                <ElIcon>
                  <ArrowUpBold v-if="isExpanded" />
                  <ArrowDownBold v-else />
                </ElIcon>
              </div>
            </button>
          </div>
        </ElCol>
      </ElRow>
    </ElForm>
  </section>
</template>

<script setup lang="ts">
  import { useAsyncState, useWindowSize } from '@vueuse/core'
  import { useI18n } from 'vue-i18n'
  import { get, isEqual, unset } from 'lodash-es'
  import {
    inject,
    onMounted,
    onUnmounted,
    unref,
    watch,
    type Component,
    type Ref,
    type VNodeChild
  } from 'vue'
  import {
    ElCheckbox,
    ElCheckboxButton,
    ElIcon,
    ElRadio,
    ElRadioButton,
    type FormInstance,
    type FormItemProp,
    type FormPropsPublic
  } from 'element-plus'
  import {
    ArrowDownBold,
    ArrowUpBold,
    QuestionFilled,
    RefreshLeft,
    Search
  } from '@element-plus/icons-vue'
  import { artFormFocusKey } from './focus'
  import type { ComponentMap } from './components'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import {
    calculateActionSpan,
    calculateResponsiveSpan,
    type ResponsiveBreakpoint
  } from '@/utils/form/responsive'
  import { replaceReactiveModel } from '@/utils/form/model'
  import {
    cloneModelValue,
    sanitizeFormValue,
    type FormRecord,
    type SanitizeOutputOptions,
    updateFormFieldValue
  } from './model-utils'

  defineOptions({ name: 'ArtForm' })

  const componentLoadAttempts = ref(0)
  // A failed ES-module fetch is cached by the browser. The compiled retry entry
  // gives one explicit retry a fresh URL without reloading or losing the model.
  const retryComponentRegistry = import.meta.glob<{ default: ComponentMap }>('./components.ts', {
    query: '?form-controls-retry'
  })
  const {
    state: componentMap,
    isLoading: componentsLoading,
    error: componentsError,
    execute: loadFormComponents
  } = useAsyncState<ComponentMap | undefined>(
    async () => {
      componentLoadAttempts.value++
      const module =
        componentLoadAttempts.value === 1
          ? await import('./components')
          : await retryComponentRegistry['./components.ts']()
      return module.default
    },
    undefined,
    { immediate: false, resetOnExecute: false, onError: () => undefined }
  )
  const componentLoadErrorMessage = computed(() =>
    componentsError.value
      ? componentLoadAttempts.value < 2
        ? '表单控件加载失败，请重试'
        : '表单控件暂时无法加载，请保留已填内容后刷新页面'
      : null
  )

  const dividerType = 'divider'
  const textType = 'text'
  const datePickerShortcutTypes = ['daterange', 'datetimerange', 'monthrange'] as const

  const { width } = useWindowSize()
  const { t } = useI18n()
  const { effectiveTenantId, defaultWriteTenantId, shouldExposeTenantField, isTenantScopeItem } =
    useTenantScopeFormPolicy()
  const isMobile = computed(() => width.value < 500)

  const formInstance = useTemplateRef<FormInstance>('formRef')

  export interface FormItemOption extends FormRecord {
    /** 选项显示文本 */
    label?: string
    /** 选项提交值 */
    value?: unknown
    /** 是否禁用该选项 */
    disabled?: boolean
    /** 树形选项的子节点 */
    children?: FormItemOption[]
  }

  export type FormItemContent = string | (() => VNodeChild) | Component
  export type FormItemPresetType = keyof ComponentMap | 'divider' | 'text'
  export type FormItemCustomType = string & {}
  export type FormItemType = FormItemPresetType | FormItemCustomType
  export type FormItemOptionType = 'default' | 'button'
  type FormItemPassThroughProps = FormRecord

  export interface FormItemOptionProps {
    /** Static options; FormItem.options and FormItem.api are also supported. */
    options?: FormItemOption[]
    /** Async option loading state; automatically managed while FormItem.api is pending. */
    loading?: boolean
  }

  export interface FormItemChoiceGroupProps extends FormItemOptionProps {
    /** Render options as button components for radioGroup and checkboxGroup. */
    optionType?: FormItemOptionType
  }

  export interface FormItemDividerProps {
    /** Whether to show the divider title extension line. */
    showLine?: boolean
    /** Whether to show the divider label content. */
    showLabel?: boolean
    /** Whether to show the divider leading marker. */
    showMarker?: boolean
    /** Whether the fields below this divider can be collapsed. */
    collapsible?: boolean
    /** Whether this section is collapsed when the form is mounted or reset. */
    defaultCollapsed?: boolean
    /** Accessible section name used by the expand/collapse button. */
    accessibleLabel?: string
  }

  export interface FormItemTextProps {
    /** Text to display when the field value is empty. */
    emptyText?: string
    /** Optional formatter for readonly text display. */
    formatter?: (value: unknown, model: FormRecord, item: FormItem) => string | number
    /** Extra class for the text node. */
    class?: string | string[] | Record<string, boolean>
  }

  export type FormItemComponentProps<TType extends FormItemType = FormItemType> = TType extends
    'radioGroup' | 'checkboxGroup'
    ? FormItemPassThroughProps & FormItemChoiceGroupProps
    : TType extends 'select' | 'selectV2' | 'tagStyleSelect' | 'segment' | 'cascader' | 'treeSelect'
      ? FormItemPassThroughProps & FormItemOptionProps
      : TType extends 'divider'
        ? FormItemPassThroughProps & FormItemDividerProps
        : TType extends 'text'
          ? FormItemPassThroughProps & FormItemTextProps
          : TType extends keyof ComponentMap
            ? FormItemPassThroughProps
            : FormItemPassThroughProps
  export type MaybePromise<T> = T | Promise<T>
  export type FormItemApiParams = FormRecord | undefined
  export type FormItemApiFn<TParams = FormItemApiParams, TResult = unknown> = (
    params: TParams
  ) => MaybePromise<TResult>
  export type FormItemBeforeFetch<TParams = FormItemApiParams> = (
    params: TParams
  ) => MaybePromise<TParams>
  export type FormItemShouldFetch<TParams = FormItemApiParams> = (
    params: TParams
  ) => MaybePromise<boolean>
  export type FormItemAfterFetch<TResult = unknown> = (
    result: TResult
  ) => MaybePromise<TResult | FormItemOption[]>
  export type ApiComponentLabelFn<TOption extends FormItemOption = FormItemOption> = (
    option: TOption
  ) => string
  export type ApiComponentAutoSelect<TOption extends FormItemOption = FormItemOption> =
    'first' | 'last' | 'one' | false | ((options: TOption[]) => TOption | undefined)
  export type FormItemHidden =
    boolean | Ref<boolean> | ((model: FormRecord, item: FormItem) => boolean)

  // 表单项配置
  export interface FormItemBase<
    TApiResult = unknown,
    TParams = FormItemApiParams,
    TType extends FormItemType = FormItemType
  > {
    /** 表单项的唯一标识 */
    key: string
    /** 表单项的标签文本或自定义渲染函数 */
    label: string | (() => VNode) | Component
    /** 显示在组件下方的常驻描述 */
    description?: FormItemContent
    /** 显示在标签帮助图标中的提示内容 */
    help?: FormItemContent
    /** 表单项标签的宽度，会覆盖 Form 的 labelWidth */
    labelWidth?: string | number
    /** 表单项类型，支持预定义的组件类型 */
    type?: TType
    /** 自定义渲染函数或组件，用于渲染自定义组件（优先级高于 type） */
    render?: (() => VNode) | Component
    /** 是否隐藏该表单项 */
    hidden?: FormItemHidden
    /** 表单项占据的列宽，基于24格栅格系统 */
    span?: number
    /** 选项数据，用于 select、checkbox-group、radio-group 等 */
    options?: FormItemOption[]
    /** 传递给字段组件的 Element Plus 原生属性及 ArtForm 扩展属性 */
    props?: FormItemComponentProps<TType>
    /** 表单项的插槽配置 */
    slots?: Record<string, (() => VNodeChild) | undefined>
    /** 表单项的占位符文本 */
    placeholder?: string
    /** 异步获取选项数据的接口，适用于 select、checkboxGroup、radioGroup、cascader、treeSelect */
    api?: FormItemApiFn<TParams, TApiResult>
    /** 是否在组件挂载后立即请求 api，默认 true */
    immediate?: boolean
    /** 传递给 api 的参数 */
    params?: TParams
    /** 请求前转换参数 */
    beforeFetch?: FormItemBeforeFetch<TParams>
    /** 请求前判断是否允许请求，返回 false 时跳过请求 */
    shouldFetch?: FormItemShouldFetch<TParams>
    /** 请求后转换响应数据，可直接返回 options 数组或返回新的响应对象 */
    afterFetch?: FormItemAfterFetch<TApiResult>
    /** 从响应对象中提取 options 数组的字段路径，支持 a.b.c */
    resultField?: string
    /** 选项 label 字段名，默认 label */
    labelField?: string
    /** 选项 value 字段名，默认 value */
    valueField?: string
    /** 自定义选项 label */
    labelFn?: ApiComponentLabelFn
    /** select 下拉选项内容组件，组件通过 option Prop 接收规范化后的选项 */
    optionComponent?: Component
    /** 子级字段名，默认 children，适用于 cascader/treeSelect */
    childrenField?: string
    /** 自动选择策略：first 首项，last 末项，one 仅一项时选中，函数自定义，false 不自动选择 */
    autoSelect?: ApiComponentAutoSelect
    /** 更多属性配置请参考 ElementPlus 官方文档 */
  }

  export type FormItem<TApiResult = unknown, TParams = FormItemApiParams> =
    | (FormItemBase<TApiResult, TParams, 'input'> & { type?: 'input' })
    | {
        [TType in FormItemPresetType]: FormItemBase<TApiResult, TParams, TType> & {
          type: TType
        }
      }[FormItemPresetType]
    | (FormItemBase<TApiResult, TParams, FormItemCustomType> & { type: FormItemCustomType })

  // 表单配置
  export interface ArtFormProps extends Partial<
    Omit<FormPropsPublic, 'model' | 'labelPosition' | 'labelWidth'>
  > {
    /** 表单数据 */
    items?: FormItem[]
    /** 租户字段用途：业务录入与查询跟随顶部范围，系统归属管理可显式开放选择 */
    tenantScopeMode?: 'write' | 'read' | 'manual'
    /** 每列的宽度（基于 24 格布局） */
    span?: number
    /** 表单控件间隙 */
    gutter?: number
    /** 表单域标签的位置；业务录入默认顶部，紧凑查询场景应显式使用 left/right */
    labelPosition?: 'left' | 'right' | 'top'
    /** 文字宽度 */
    labelWidth?: string | number
    /** 按钮靠左对齐限制（表单项小于等于该值时） */
    buttonLeftLimit?: number
    /** 是否显示重置按钮 */
    showReset?: boolean
    /** 异步重置业务筛选时的按钮加载状态 */
    resetLoading?: boolean
    /** 异步提交期间显示按钮反馈并阻止重复提交 */
    submitLoading?: boolean
    /** 是否显示提交按钮 */
    showSubmit?: boolean
    /** 是否禁用提交按钮 */
    disabledSubmit?: boolean
    /** 根节点附加 class */
    rootClass?: string
    /** 自定义布局时传给内部 ElForm 的 class */
    formClass?: string
    /** 使用默认插槽接管表单内部布局，校验和 Ref API 仍由 ArtForm 提供 */
    customLayout?: boolean
    /** 重置按钮文本 */
    resetText?: string
    /** 提交按钮文本 */
    submitText?: string
    /** 是否启用折叠展开能力 */
    enableExpand?: boolean
    /** 是否强制展开全部表单项 */
    isExpand?: boolean
    /** 默认是否展开 */
    defaultExpanded?: boolean
    /** 是否显示展开/收起按钮 */
    showExpand?: boolean
    /** 是否允许 divider 分区标题折叠其下方字段 */
    collapsibleSections?: boolean
    /** 提交时是否清洗空值 */
    sanitizeOutput?: Partial<SanitizeOutputOptions>
  }

  const props = withDefaults(defineProps<ArtFormProps>(), {
    items: () => [],
    tenantScopeMode: 'write',
    span: 6,
    gutter: 12,
    labelPosition: 'top',
    labelWidth: '70px',
    buttonLeftLimit: 2,
    showReset: true,
    resetLoading: false,
    submitLoading: false,
    showSubmit: true,
    disabledSubmit: false,
    rootClass: '',
    formClass: '',
    customLayout: false,
    resetText: '',
    submitText: '',
    enableExpand: false,
    isExpand: false,
    defaultExpanded: false,
    showExpand: true,
    collapsibleSections: true,
    sanitizeOutput: () => ({})
  })
  const needsComponentRegistry = computed(
    () =>
      !props.customLayout &&
      props.items.some(
        (item) => item.type !== dividerType && item.type !== textType && !item.render
      )
  )
  const formControlsReady = computed(() => !needsComponentRegistry.value || !!componentMap.value)
  watch(
    needsComponentRegistry,
    (needed) => {
      if (needed && !componentMap.value && !componentsLoading.value) void loadFormComponents()
    },
    { immediate: true }
  )
  const overlayFocus = inject(artFormFocusKey, undefined)
  const activeLabelTooltipKey = ref<string | null>(null)
  const showOverflowLabelTooltip = (event: MouseEvent, key: string): void => {
    const label = event.currentTarget
    if (label instanceof HTMLElement && label.scrollWidth > label.clientWidth) {
      activeLabelTooltipKey.value = key
    }
  }
  const hideOverflowLabelTooltip = (key: string): void => {
    if (activeLabelTooltipKey.value === key) activeLabelTooltipKey.value = null
  }
  watch(
    () => overlayFocus?.focusMode.value,
    (focused) => {
      if (!focused) activeLabelTooltipKey.value = null
    }
  )
  const effectiveLabelPosition = computed(() =>
    overlayFocus?.focusMode.value && width.value >= 768 ? 'left' : props.labelPosition
  )
  const effectiveGutter = computed(() =>
    overlayFocus?.focusMode.value ? Math.min(props.gutter, 16) : props.gutter
  )
  let unregisterOverlayForm: (() => void) | undefined

  export interface ArtFormEmits {
    reset: []
    submit: [FormRecord]
    validate: [prop: FormItemProp, isValid: boolean, message: string]
  }

  const emit = defineEmits<ArtFormEmits>()

  const modelValue = defineModel<FormRecord>({ default: () => ({}) })
  const initialModelValue = ref<FormRecord>({})
  const isExpanded = ref(props.defaultExpanded)
  const collapsedSectionKeys = ref<Set<string>>(new Set())
  const asyncOptionsMap = ref<Record<string, FormRecord[]>>({})
  const asyncLoadingMap = ref<Record<string, boolean>>({})
  const asyncErrorMap = shallowRef<Record<string, Error | undefined>>({})
  const optionRequestVersions: Record<string, number> = {}
  let optionsActive = true
  const hasBlockingFields = computed(
    () =>
      !formControlsReady.value ||
      visibleFormItems.value.some(
        (item) =>
          item.api &&
          isOptionComponent(item) &&
          (asyncLoadingMap.value[item.key] || !!asyncErrorMap.value[item.key])
      )
  )
  const asyncRequestSignatureMap = ref<Record<string, string>>({})

  initialModelValue.value = cloneModelValue(modelValue.value)

  const rootProps = [
    'label',
    'description',
    'help',
    'labelWidth',
    'key',
    'type',
    'render',
    'hidden',
    'span',
    'slots',
    'api',
    'immediate',
    'params',
    'beforeFetch',
    'shouldFetch',
    'afterFetch',
    'resultField',
    'labelField',
    'valueField',
    'labelFn',
    'optionComponent',
    'childrenField',
    'autoSelect'
  ]
  // 业务表单默认保留空字符串，避免编辑时清空字段后输出丢字段；搜索表单可在 ArtSearchBar 中覆盖。
  const sanitizeOutputOptions = computed<SanitizeOutputOptions>(() => ({
    removeEmptyString: false,
    removeEmptyArray: false,
    removeEmptyObject: false,
    removeEmptyRichText: false,
    keepZero: true,
    keepFalse: true,
    ...props.sanitizeOutput
  }))

  const getFieldValue = (path: string) => {
    return get(modelValue.value, path)
  }

  const commitModelValue = (nextValue: FormRecord) => {
    const currentValue = modelValue.value

    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      replaceReactiveModel(currentValue, nextValue)
      return
    }

    modelValue.value = nextValue
  }

  const normalizeClearedValue = (value: unknown, item: FormItem): unknown => {
    if (value !== undefined && value !== null) return value

    if (shouldNormalizeClearToEmptyString(item)) {
      return ''
    }

    return value
  }

  const setFieldValue = (path: string, value: unknown, item: FormItem) => {
    const normalizedValue = normalizeClearedValue(value, item)
    if (!path) return

    if (
      !modelValue.value ||
      typeof modelValue.value !== 'object' ||
      Array.isArray(modelValue.value)
    ) {
      modelValue.value = {}
    }

    updateFormFieldValue(modelValue.value, path, normalizedValue)
  }

  const emptyStringClearTypes = [
    'input',
    'textarea',
    'inputTag',
    'select',
    'selectV2',
    'tagStyleSelect',
    'treeSelect',
    'cascader'
  ]
  const stringValueFieldKeys = ref(new Set<string>())

  const shouldNormalizeClearToEmptyString = (item: FormItem): boolean => {
    if (emptyStringClearTypes.includes(String(item.type))) return true

    if (!item.slots && !item.render) return false

    const initialValue = get(initialModelValue.value, item.key)
    return stringValueFieldKeys.value.has(item.key) || typeof initialValue === 'string'
  }

  const normalizeClearedFormValues = () => {
    props.items.forEach((item) => {
      const value = getFieldValue(item.key)

      if (typeof value === 'string') {
        stringValueFieldKeys.value.add(item.key)
        return
      }

      if ((value === null || value === undefined) && shouldNormalizeClearToEmptyString(item)) {
        setFieldValue(item.key, '', item)
      }
    })
  }

  const createSlotSetValue = (item: FormItem) => {
    return (value: unknown) => setFieldValue(item.key, value, item)
  }

  const createSlotClearValue = (item: FormItem) => {
    return () => setFieldValue(item.key, undefined, item)
  }

  const getSanitizedOutput = () => {
    const outputValue = cloneModelValue(modelValue.value)

    props.items.forEach((item) => {
      if (isFormItemHidden(item)) {
        unset(outputValue, item.key)
      }
    })

    return (sanitizeFormValue(outputValue, sanitizeOutputOptions.value) || {}) as FormRecord
  }

  const optionComponentTypes = [
    'select',
    'selectV2',
    'tagStyleSelect',
    'segment',
    'checkboxGroup',
    'radioGroup',
    'cascader',
    'treeSelect',
    'userSelect'
  ]

  const isOptionComponent = (item: FormItem) => optionComponentTypes.includes(String(item.type))

  const extractOptionsResult = (result: unknown, resultField?: string): FormRecord[] => {
    const target = resultField ? get(result, resultField) : result
    return Array.isArray(target) ? target : []
  }

  const normalizeOptionItem = (option: FormRecord, item: FormItem): FormRecord => {
    const labelField = item.labelField || 'label'
    const valueField = item.valueField || 'value'
    const childrenField = item.childrenField || 'children'
    const children = option[childrenField]
    const normalizedOption: FormRecord = {
      ...option,
      label: item.labelFn ? item.labelFn(option) : (option[labelField] ?? option.label),
      value: option[valueField] ?? option.value
    }

    if (Array.isArray(children)) {
      normalizedOption.children = children.map((child) => normalizeOptionItem(child, item))
    }

    return normalizedOption
  }

  const normalizeOptions = (options: FormRecord[], item: FormItem) => {
    return options.map((option) => normalizeOptionItem(option, item))
  }

  const isEmptyFieldValue = (value: unknown) => {
    return (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && !value.length)
    )
  }

  const applyAutoSelect = (item: FormItem, options: FormRecord[]) => {
    if (!item.autoSelect || !options.length || !isEmptyFieldValue(getFieldValue(item.key))) return

    let selectedOption: FormRecord | undefined
    if (item.autoSelect === 'first') {
      selectedOption = options[0]
    } else if (item.autoSelect === 'last') {
      selectedOption = options[options.length - 1]
    } else if (item.autoSelect === 'one' && options.length === 1) {
      selectedOption = options[0]
    } else if (typeof item.autoSelect === 'function') {
      selectedOption = item.autoSelect(options)
    }

    if (selectedOption) {
      setFieldValue(item.key, selectedOption.value, item)
    }
  }

  const fetchOptions = async (item: FormItem): Promise<FormRecord[]> => {
    if (!item.api || !isOptionComponent(item)) return getOptions(item)
    const version = (optionRequestVersions[item.key] ?? 0) + 1
    optionRequestVersions[item.key] = version
    const isCurrent = () => optionsActive && optionRequestVersions[item.key] === version
    asyncLoadingMap.value[item.key] = true
    asyncErrorMap.value = { ...asyncErrorMap.value, [item.key]: undefined }
    try {
      let apiParams = cloneModelValue(item.params) as FormRecord | undefined
      if (item.beforeFetch) apiParams = await item.beforeFetch(apiParams)
      if (!isCurrent()) return []
      if (item.shouldFetch && !(await item.shouldFetch(apiParams))) {
        if (isCurrent()) asyncOptionsMap.value[item.key] = []
        return []
      }
      if (!isCurrent()) return []
      const rawResult = await item.api(apiParams)
      if (!isCurrent()) return []
      const responseError = get(rawResult, 'error')
      if (responseError) throw responseError
      const result = item.afterFetch ? await item.afterFetch(rawResult) : rawResult
      if (!isCurrent()) return []
      const transformedError = get(result, 'error')
      if (transformedError) throw transformedError
      const options = normalizeOptions(extractOptionsResult(result, item.resultField), item)
      asyncOptionsMap.value[item.key] = options
      applyAutoSelect(item, options)
      return options
    } catch (cause) {
      if (isCurrent()) {
        asyncOptionsMap.value[item.key] = []
        asyncErrorMap.value = {
          ...asyncErrorMap.value,
          [item.key]: new Error('选项加载失败，请重新加载后再选择', { cause })
        }
      }
      return []
    } finally {
      if (isCurrent()) asyncLoadingMap.value[item.key] = false
    }
  }

  const getOptionsRequestSignature = (item: FormItem): string => {
    const params = cloneModelValue(item.params) as FormRecord | undefined

    try {
      return JSON.stringify({
        key: item.key,
        immediate: item.immediate,
        params
      })
    } catch {
      return `${item.key}:${String(item.immediate)}`
    }
  }

  const loadImmediateOptions = () => {
    props.items.forEach((item) => {
      if (isTenantScopeItem(item)) return
      if (item.api && item.immediate !== false) {
        const signature = getOptionsRequestSignature(item)
        if (asyncRequestSignatureMap.value[item.key] === signature) return

        asyncRequestSignatureMap.value[item.key] = signature
        void fetchOptions(item)
      }
    })
  }

  const reloadOptions = async (key?: string) => {
    const targetItems = (key ? props.items.filter((item) => item.key === key) : props.items).filter(
      (item) => !isTenantScopeItem(item)
    )
    const results = await Promise.all(targetItems.filter((item) => item.api).map(fetchOptions))
    return key ? results[0] : results
  }

  const getProps = (item: FormItem): FormRecord => {
    if (item.props) return item.props
    const props: FormRecord = { ...item }
    rootProps.forEach((key) => delete props[key])
    return props
  }

  const getOptions = (item: FormItem): FormRecord[] => {
    if (asyncOptionsMap.value[item.key]) return asyncOptionsMap.value[item.key]
    const options = item.options ?? getProps(item).options
    return Array.isArray(options) ? normalizeOptions(options, item) : []
  }

  const getPlainTextLabel = (item: FormItem): string => {
    return typeof item.label === 'string' ? item.label : ''
  }

  const getDefaultPlaceholder = (item: FormItem): string | undefined => {
    const label = getPlainTextLabel(item)
    if (!label) return undefined

    if (
      [
        'select',
        'selectV2',
        'cascader',
        'treeSelect',
        'date',
        'timePicker',
        'timeSelect',
        'dataSelect',
        'userSelect',
        ...datePickerShortcutTypes
      ].includes(String(item.type))
    ) {
      return `请选择${label}`
    }

    if (['input', 'autocomplete', 'textarea', 'inputTag', 'number'].includes(String(item.type))) {
      return `请输入${label}`
    }

    return undefined
  }

  const getDefaultComponentProps = (item: FormItem): FormRecord => {
    const itemType = String(item.type)
    const defaults: FormRecord = {}
    const placeholder = getDefaultPlaceholder(item)

    if (placeholder) {
      defaults.placeholder = placeholder
    }

    if (
      [
        'input',
        'autocomplete',
        'inputTag',
        'select',
        'selectV2',
        'cascader',
        'treeSelect',
        'userSelect',
        'date',
        'timePicker',
        'timeSelect',
        'dataSelect',
        ...datePickerShortcutTypes
      ].includes(itemType)
    ) {
      defaults.clearable = true
    }

    if (['select', 'selectV2', 'cascader', 'treeSelect', 'userSelect'].includes(itemType)) {
      defaults.filterable = true
    }

    if (datePickerShortcutTypes.includes(itemType as (typeof datePickerShortcutTypes)[number])) {
      defaults.type = itemType
    }

    if (isTextareaItem(item)) {
      Object.assign(defaults, {
        type: 'textarea',
        rows: 4,
        maxlength: 300,
        showWordLimit: true,
        resize: 'vertical'
      })
    }

    return defaults
  }

  const isTextareaItem = (item: FormItem): boolean => {
    return String(item.type) === 'textarea' || getProps(item).type === 'textarea'
  }

  const isDividerItem = (item: FormItem): boolean => String(item.type) === dividerType

  const isTextItem = (item: FormItem): boolean => String(item.type) === textType

  const getTextDisplayValue = (item: FormItem): string => {
    const props = getProps(item)
    const value = getFieldValue(item.key)
    const formattedValue =
      typeof props.formatter === 'function' ? props.formatter(value, modelValue.value, item) : value

    if (formattedValue === undefined || formattedValue === null || formattedValue === '') {
      return props.emptyText ?? '-'
    }

    return String(formattedValue)
  }

  const getTextClass = (item: FormItem) => getProps(item).class

  const getDividerShowLine = (item: FormItem): boolean => getProps(item).showLine !== false

  const getDividerShowLabel = (item: FormItem): boolean => getProps(item).showLabel !== false

  const getDividerShowMarker = (item: FormItem): boolean => getProps(item).showMarker !== false

  const getDividerAccessibleLabel = (item: FormItem): string => {
    const dividerProps = getProps(item)
    if (typeof dividerProps.accessibleLabel === 'string') return dividerProps.accessibleLabel
    return typeof item.label === 'string' ? item.label : ''
  }

  const isDividerCollapsible = (item: FormItem): boolean =>
    props.collapsibleSections && getProps(item).collapsible !== false

  const isSectionCollapsed = (sectionKey: string): boolean =>
    collapsedSectionKeys.value.has(sectionKey)

  const toggleSection = (sectionKey: string): void => {
    const nextKeys = new Set(collapsedSectionKeys.value)
    if (nextKeys.has(sectionKey)) nextKeys.delete(sectionKey)
    else nextKeys.add(sectionKey)
    collapsedSectionKeys.value = nextKeys
  }

  const findOwningDivider = (item: FormItem): FormItem | undefined => {
    const itemIndex = filteredFormItems.value.findIndex((candidate) => candidate.key === item.key)
    if (itemIndex <= 0) return undefined

    for (let index = itemIndex - 1; index >= 0; index -= 1) {
      const candidate = filteredFormItems.value[index]
      if (candidate && isDividerItem(candidate)) return candidate
    }

    return undefined
  }

  const getFormItemLabelWidth = (item: FormItem): string | number | undefined => {
    if (!item.label) return undefined
    return overlayFocus?.focusMode.value && width.value >= 768
      ? 112
      : item.labelWidth || labelWidth.value
  }

  const isFieldDisabled = (item: FormItem): boolean =>
    Boolean(
      props.disabled ||
      getProps(item).disabled ||
      (item.api &&
        isOptionComponent(item) &&
        (asyncLoadingMap.value[item.key] || asyncErrorMap.value[item.key]))
    )

  const getComponentProps = (item: FormItem) => {
    const componentProps = { ...getDefaultComponentProps(item), ...getProps(item) }
    if (isFieldDisabled(item)) componentProps.disabled = true
    const options = getOptions(item)

    if (['select', 'selectV2', 'checkboxGroup', 'radioGroup'].includes(String(item.type))) {
      delete componentProps.options
    }
    if (['selectV2', 'cascader', 'segment'].includes(String(item.type))) {
      componentProps.options = options
    }
    if (String(item.type) === 'tagStyleSelect') {
      componentProps.options = options
    }
    if (String(item.type) === 'treeSelect') {
      componentProps.data = componentProps.data ?? options
    }
    if (String(item.type) === 'userSelect') {
      componentProps.options = options
    }
    if (String(item.type) === 'dataSelect') {
      if (item.api && !componentProps.apiFn) {
        componentProps.apiFn = (params: FormRecord) => {
          const baseParams =
            item.params && typeof item.params === 'object' ? (item.params as FormRecord) : {}
          return item.api?.({ ...baseParams, ...params })
        }
      }
      componentProps.rowKey = componentProps.rowKey ?? item.valueField
      componentProps.labelKey = componentProps.labelKey ?? item.labelField
      componentProps.childrenKey = componentProps.childrenKey ?? item.childrenField
      componentProps.resultField = componentProps.resultField ?? item.resultField
    }
    if (item.api) {
      componentProps.loading = asyncLoadingMap.value[item.key] || componentProps.loading
    }
    delete componentProps.optionType
    return componentProps
  }

  // 获取插槽
  const getSlots = (item: FormItem) => {
    if (!item.slots) return {}
    const validSlots: Record<string, () => VNodeChild> = {}
    Object.entries(item.slots).forEach(([key, slotFn]) => {
      if (slotFn) {
        validSlots[key] = slotFn
      }
    })
    return validSlots
  }

  const hasPickerEmptySlot = (item: FormItem): boolean =>
    ['select', 'selectV2', 'cascader', 'treeSelect'].includes(String(item.type))

  const getPickerEmptyTitle = (item: FormItem): string => {
    const configured = getProps(item).noDataText
    return typeof configured === 'string' && configured.trim() ? configured : '暂无可选数据'
  }

  // 组件
  const getComponent = (item: FormItem) => {
    // 优先使用 render 函数或组件渲染自定义组件
    if (item.render) {
      return item.render
    }
    // 使用 type 获取预定义组件
    const { type } = item
    return componentMap.value?.[type as keyof ComponentMap] || componentMap.value?.input
  }

  /**
   * 获取列宽 span 值
   * 根据屏幕尺寸智能降级，避免小屏幕上表单项被压缩过小
   */
  const getColSpan = (itemSpan: number | undefined, breakpoint: ResponsiveBreakpoint): number => {
    return calculateResponsiveSpan(itemSpan, span.value, breakpoint)
  }

  /** 长文本默认独占整行；调用方仍可通过 span 显式覆盖。 */
  const getItemSpan = (item: FormItem): number | undefined => {
    return item.span ?? (isTextareaItem(item) ? 24 : undefined)
  }

  const getActionColSpan = (breakpoint: ResponsiveBreakpoint): number => {
    return calculateActionSpan(
      visibleFormItems.value.map((item) => getColSpan(getItemSpan(item), breakpoint))
    )
  }

  const isFormItemHidden = (item: FormItem): boolean => {
    if (typeof item.hidden === 'function') {
      return item.hidden(modelValue.value, item)
    }

    return !!unref(item.hidden)
  }

  const isFormItemCollapsed = (item: FormItem): boolean => {
    if (isDividerItem(item)) return false
    const divider = findOwningDivider(item)
    return !!(divider && isDividerCollapsible(divider) && isSectionCollapsed(divider.key))
  }

  const filteredFormItems = computed(() => {
    return props.items.filter(
      (item) =>
        (!isTenantScopeItem(item) ||
          (props.tenantScopeMode === 'manual' && shouldExposeTenantField.value)) &&
        !isFormItemHidden(item)
    )
  })

  const syncTenantScopeField = () => {
    const tenantItem = props.items.find(isTenantScopeItem)
    if (!tenantItem) return

    const tenantId =
      effectiveTenantId.value ||
      (props.tenantScopeMode !== 'read' && !getFieldValue(tenantItem.key)
        ? defaultWriteTenantId.value
        : null)
    if (props.tenantScopeMode === 'read' && !tenantId) {
      if (getFieldValue(tenantItem.key)) setFieldValue(tenantItem.key, '', tenantItem)
    } else if (tenantId && getFieldValue(tenantItem.key) !== tenantId) {
      setFieldValue(tenantItem.key, tenantId, tenantItem)
    }
  }

  /**
   * 可见的表单项
   */
  const visibleFormItems = computed(() => {
    const shouldShowLess =
      props.enableExpand && props.showExpand && !props.isExpand && !isExpanded.value

    if (shouldShowLess) {
      const maxItemsPerRow = Math.floor(24 / props.span) - 1
      return filteredFormItems.value.slice(0, maxItemsPerRow)
    }

    return filteredFormItems.value
  })

  const shouldShowExpandToggle = computed(() => {
    return (
      props.enableExpand &&
      !props.isExpand &&
      props.showExpand &&
      filteredFormItems.value.length > Math.floor(24 / props.span) - 1
    )
  })

  const expandToggleText = computed(() => {
    return isExpanded.value ? t('table.searchBar.collapse') : t('table.searchBar.expand')
  })

  const toggleExpand = () => {
    isExpanded.value = !isExpanded.value
  }

  /**
   * 操作按钮样式
   */
  const actionButtonsStyle = computed(() => ({
    'justify-content': isMobile.value
      ? 'flex-end'
      : filteredFormItems.value.length <= props.buttonLeftLimit
        ? 'flex-start'
        : 'flex-end'
  }))

  /**
   * 处理重置事件
   */
  const handleReset = () => {
    // 重置表单字段（UI 层）
    formInstance.value?.resetFields()

    // 恢复初始表单值，保留默认值而不是简单清空。
    commitModelValue(cloneModelValue(initialModelValue.value))
    syncTenantScopeField()
    resetCollapsedSections()

    // 触发 reset 事件
    emit('reset')
  }

  /**
   * 处理提交事件
   */
  const handleSubmit = () => {
    if (props.disabled || props.submitLoading || props.disabledSubmit || hasBlockingFields.value)
      return
    syncTenantScopeField()
    // 对外只抛出清洗后的结果，避免业务层重复过滤空值。
    emit('submit', getSanitizedOutput())
  }

  const handleValidate = (prop: FormItemProp, isValid: boolean, message: string) => {
    if (!isValid) {
      const fieldKey = Array.isArray(prop) ? prop.join('.') : String(prop)
      const fieldItem = filteredFormItems.value.find((item) => item.key === fieldKey)
      const divider = fieldItem ? findOwningDivider(fieldItem) : undefined
      if (divider && isSectionCollapsed(divider.key)) {
        const nextKeys = new Set(collapsedSectionKeys.value)
        nextKeys.delete(divider.key)
        collapsedSectionKeys.value = nextKeys
        nextTick(() => formInstance.value?.scrollToField(prop))
      }
    }
    emit('validate', prop, isValid, message)
  }

  const resetCollapsedSections = (): void => {
    collapsedSectionKeys.value = new Set(
      filteredFormItems.value
        .filter(
          (item) =>
            isDividerItem(item) &&
            isDividerCollapsible(item) &&
            getProps(item).defaultCollapsed === true
        )
        .map((item) => item.key)
    )
  }

  onMounted(() => {
    unregisterOverlayForm = overlayFocus?.registerForm()
    resetCollapsedSections()
    loadImmediateOptions()
  })

  onUnmounted(() => {
    optionsActive = false
    unregisterOverlayForm?.()
  })

  watch(
    () =>
      props.items.map((item) => ({
        key: item.key,
        hasApi: !!item.api,
        immediate: item.immediate,
        params: cloneModelValue(item.params)
      })),
    (nextItems, previousItems) => {
      for (const previous of previousItems) {
        const next = nextItems.find((item) => item.key === previous.key)
        if (next && isEqual(next, previous)) continue
        const hadRequest = optionRequestVersions[previous.key] !== undefined
        optionRequestVersions[previous.key] = (optionRequestVersions[previous.key] ?? 0) + 1
        delete asyncRequestSignatureMap.value[previous.key]
        delete asyncOptionsMap.value[previous.key]
        asyncLoadingMap.value[previous.key] = false
        asyncErrorMap.value = {
          ...asyncErrorMap.value,
          [previous.key]:
            next?.hasApi && hadRequest ? new Error('选项条件已变化，请重新加载后再选择') : undefined
        }
      }
      loadImmediateOptions()
    },
    { deep: true }
  )

  watch(
    () =>
      props.items.map((item) => ({
        key: item.key,
        type: item.type,
        slots: item.slots,
        render: item.render,
        value: getFieldValue(item.key)
      })),
    normalizeClearedFormValues,
    { deep: true, immediate: true }
  )

  watch(
    () => [
      effectiveTenantId.value,
      defaultWriteTenantId.value,
      props.tenantScopeMode,
      props.items.some(isTenantScopeItem),
      getFieldValue('tenantId')
    ],
    syncTenantScopeField,
    { immediate: true }
  )

  watch(
    () => modelValue.value,
    (nextModel, previousModel) => {
      if (nextModel !== previousModel) nextTick(resetCollapsedSections)
    }
  )

  defineExpose({
    ref: formInstance,
    controlsReady: formControlsReady,
    readyToSubmit: computed(
      () =>
        !props.disabled && !props.submitLoading && !props.disabledSubmit && !hasBlockingFields.value
    ),
    validate: async (...args: Parameters<FormInstance['validate']>) => {
      if (hasBlockingFields.value) {
        const invalidFields = Object.fromEntries(
          visibleFormItems.value
            .filter(
              (item) =>
                (!formControlsReady.value && !isDividerItem(item) && !isTextItem(item)) ||
                (item.api &&
                  isOptionComponent(item) &&
                  (asyncLoadingMap.value[item.key] || !!asyncErrorMap.value[item.key]))
            )
            .map((item) => [
              item.key,
              [
                {
                  field: item.key,
                  message: !formControlsReady.value
                    ? (componentLoadErrorMessage.value ?? '表单控件正在加载，请稍候')
                    : (asyncErrorMap.value[item.key]?.message ?? '选项正在加载，请稍候')
                }
              ]
            ])
        )
        if (args[0]) {
          await args[0](false, invalidFields)
          return false
        }
        throw invalidFields
      }
      return formInstance.value?.validate(...args)
    },
    validateField: (...args: Parameters<FormInstance['validateField']>) =>
      formInstance.value?.validateField(...args),
    clearValidate: (...args: Parameters<FormInstance['clearValidate']>) =>
      formInstance.value?.clearValidate(...args),
    scrollToField: (...args: Parameters<FormInstance['scrollToField']>) =>
      formInstance.value?.scrollToField(...args),
    reset: handleReset,
    fetchOptions,
    reloadOptions,
    expandAllSections: () => {
      collapsedSectionKeys.value = new Set()
    },
    resetCollapsedSections,
    // 允许外部在不触发提交事件时主动获取清洗后的输出。
    getOutput: getSanitizedOutput
  })

  // 解构 props 以便在模板中直接使用
  const { span, labelWidth } = toRefs(props)
</script>

<style scoped lang="scss" src="./style.scss"></style>
