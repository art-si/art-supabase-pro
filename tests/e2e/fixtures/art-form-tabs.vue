<template>
  <main v-if="nativeScroll" class="mx-auto min-w-0 max-w-5xl p-4">
    <DefineNativeContent>
      <div data-testid="native-content">
        <div class="mb-4 flex flex-wrap gap-2">
          <ElButton @click="nativeFlag = 'default'">默认自动定位</ElButton>
          <ElButton @click="nativeFlag = 'on'">启用自动定位</ElButton>
          <ElButton @click="nativeFlag = 'off'">关闭自动定位</ElButton>
          <ElButton @click="nativeOptions = 'end'">末端定位</ElButton>
          <ElButton @click="nativeOptions = 'boolean'">布尔末端定位</ElButton>
          <ElButton @click="validateNative">校验滚动表单</ElButton>
          <ElButton @click="nativeForm?.scrollToField('errorName')">手动定位联系人</ElButton>
          <ElButton @click="nativeForm?.focusField('errorName')">手动聚焦联系人</ElButton>
          <ElButton @click="resetNative">重置滚动表单</ElButton>
        </div>
        <output aria-label="滚动校验结果">{{ nativeValidation }}</output>
        <output aria-label="滚动校验次数">{{ nativeValidations }}</output>
        <ArtForm
          ref="nativeForm"
          v-model="nativeModel"
          v-model:active-tab="nativeActiveTab"
          :items="nativeItems"
          :rules="nativeRules"
          :span="24"
          v-bind="nativeProps"
        />
      </div>
    </DefineNativeContent>
    <component v-if="nativeOverlay" :is="nativeOverlayComponent" ref="nativeOverlayRef">
      <ReuseNativeContent />
    </component>
    <ElScrollbar v-else height="420" data-testid="native-scroll">
      <div class="art-card-xs p-2"><ReuseNativeContent /></div>
    </ElScrollbar>
  </main>
  <main v-else class="mx-auto min-w-0 max-w-5xl p-4">
    <h1 class="mb-2 text-xl font-semibold">横向页签表单</h1>
    <p class="mb-4 text-sm text-g-700">切换页签保留已填内容，提交时校验全部可见业务字段。</p>
    <div class="mb-4 flex flex-wrap gap-2" aria-label="验收操作">
      <ElButton @click="validate(false)">外部校验</ElButton>
      <ElButton @click="validate(true)">回调校验</ElButton>
      <ElButton @click="validateContact">单字段校验</ElButton>
      <ElButton @click="form?.scrollToField('contact')">定位业务字段</ElButton>
      <ElButton @click="form?.focusField('contact')">聚焦业务字段</ElButton>
      <ElButton @click="validateFrozen">校验归档字段</ElButton>
      <ElButton @click="activeTab = 'business'">外部切换业务页签</ElButton>
      <ElButton @click="showNotes = !showNotes">{{
        showNotes ? '隐藏备注页签' : '显示备注页签'
      }}</ElButton>
    </div>
    <output class="mb-3 block text-sm" aria-label="校验结果">{{ validation }}</output>
    <output class="mb-3 block text-sm" aria-label="当前页签">{{ activeTab }}</output>
    <ElScrollbar :max-height="scrollStress ? 420 : undefined" data-testid="form-scroll">
      <div class="art-card-xs p-2">
        <ArtForm
          show-reset
          show-submit
          ref="form"
          v-model="model"
          v-model:active-tab="activeTab"
          :items="items"
          :rules="rules"
          :span="12"
          :gutter="24"
          submit-text="保存表单"
          reset-text="重置表单"
          @submit="submit"
        >
          <template #notes="{ value, setValue }">
            <ElInput
              :model-value="String(value ?? '')"
              aria-label="备注内容"
              type="textarea"
              @update:model-value="setValue($event)"
            />
          </template>
        </ArtForm>
      </div>
    </ElScrollbar>
    <output class="mt-4 block break-all text-sm" data-testid="form-output">{{ output }}</output>
  </main>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, shallowRef } from 'vue'
  import { createReusableTemplate } from '@vueuse/core'
  import { ElButton, ElInput, ElScrollbar, type FormProps, type FormRules } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'

  const params = new URLSearchParams(window.location.search)
  const nativeScroll = params.has('native-scroll')
  const nativeTabs = params.get('native-scroll') !== 'plain'
  const nativeOverlay = params.get('overlay')
  const nativeOverlayComponent = nativeOverlay === 'drawer' ? ArtDrawer : ArtDialog
  const nativeOverlayRef = shallowRef<ArtDialogExpose<undefined> | ArtDrawerExpose<undefined>>()
  const nativeForm = ref<InstanceType<typeof ArtForm>>()
  const [DefineNativeContent, ReuseNativeContent] = createReusableTemplate()
  const nativeFlag = ref(params.get('flag') || 'default')
  const nativeOptions = ref(params.get('options') || 'default')
  const nativeActiveTab = ref('general')
  const nativeValidation = ref('尚未校验')
  const nativeValidations = ref(0)
  const nativeModel = ref({
    name: '原始业务草稿',
    history: '已登记业务记录。'.repeat(700),
    errorName: '',
    tail: '后续业务资料。'.repeat(700)
  })
  const nativeItems = computed<FormItem[]>(() => {
    const items: FormItem[] = [
      { key: 'general', label: '基础资料', type: 'tab' },
      { key: 'name', label: '业务名称', type: 'input' },
      { key: 'business', label: '联系资料', type: 'tab' },
      { key: 'history', label: '已登记资料', type: 'text' },
      { key: 'errorName', label: '待校验联系人', type: 'input' },
      { key: 'tail', label: '后续资料', type: 'text' }
    ]
    return items.filter((item) => nativeTabs || item.type !== 'tab')
  })
  const nativeRules: FormRules = {
    errorName: [{ required: true, message: '请填写待校验联系人', trigger: 'blur' }]
  }
  const nativeProps = computed<Partial<FormProps>>(() => ({
    ...(nativeFlag.value === 'default' ? {} : { scrollToError: nativeFlag.value === 'on' }),
    ...(nativeOptions.value === 'end'
      ? { scrollIntoViewOptions: { block: 'end', behavior: 'smooth' } }
      : nativeOptions.value === 'boolean'
        ? { scrollIntoViewOptions: false }
        : {})
  }))
  async function validateNative(): Promise<boolean> {
    try {
      const valid = (await nativeForm.value?.validate(() => undefined)) === true
      nativeValidation.value = valid ? '校验通过' : '校验失败'
      return valid
    } finally {
      nativeValidations.value++
    }
  }
  function resetNative() {
    nativeForm.value?.reset()
    nativeValidation.value = '尚未校验'
  }
  onMounted(() => {
    if (nativeScroll && nativeOverlay)
      void nativeOverlayRef.value?.handleOpen(undefined, {
        title: '表单定位参数验收',
        confirmText: '确认校验',
        ...(nativeOverlay === 'dialog' ? { contentHeight: 420 } : {}),
        onConfirm: validateNative
      })
  })

  const form = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('general')
  const showNotes = ref(true)
  const validation = ref('尚未校验')
  const output = ref('尚未保存')
  const scrollStress = new URLSearchParams(window.location.search).has('scroll')
  const model = ref({
    documentNo: 'DEMO-001',
    name: '',
    specification: '',
    contact: '',
    category: 'standard',
    notes: '初始备注',
    internalValue: '',
    frozenValue: '只读配置'
  })
  const items = computed<FormItem[]>(() => [
    { key: 'documentNo', label: '单据编号', type: 'input', span: 24 },
    { key: 'general', label: '基本信息', type: 'tab', description: '维护名称与产品规格。' },
    { key: 'name', label: '名称', type: 'input', props: { clearable: true } },
    {
      key: 'productSection',
      label: '产品信息',
      type: 'divider',
      span: 24,
      props: { defaultCollapsed: true }
    },
    { key: 'specification', label: '产品规格', type: 'input' },
    { key: 'business', label: '业务信息', type: 'tab', description: '维护联系人与业务分类。' },
    {
      key: 'history',
      label: '业务记录',
      type: 'input',
      span: 24,
      hidden: !scrollStress,
      props: { type: 'textarea', rows: 20 }
    },
    { key: 'contact', label: '联系人', type: 'input' },
    {
      key: 'category',
      label: '业务分类',
      type: 'select',
      api: async () => {
        const response = await fetch('/__art-form-tab-options')
        if (!response.ok) throw new Error('分类选项加载失败，请重试')
        return response.json()
      }
    },
    { key: 'internal', label: '内部信息', type: 'tab', hidden: true },
    { key: 'internalValue', label: '内部字段', type: 'input' },
    { key: 'notesTab', label: '附加说明', type: 'tab', hidden: () => !showNotes.value },
    { key: 'notes', label: '备注', type: 'slot', span: 24 },
    { key: 'frozen', label: '归档配置', type: 'tab', props: { disabled: true } },
    { key: 'frozenValue', label: '归档负责人', type: 'input' }
  ])
  const rules: FormRules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    specification: [{ required: true, message: '请输入产品规格', trigger: 'blur' }],
    contact: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
    internalValue: [{ required: true, message: '隐藏字段不应参与校验', trigger: 'blur' }],
    frozenValue: [{ required: true, message: '请输入归档负责人', trigger: 'blur' }]
  }
  const validate = async (callback: boolean): Promise<boolean> => {
    try {
      if (callback) {
        let valid = false
        await form.value?.validate((passed, fields) => {
          valid = passed
          validation.value = passed
            ? '校验通过'
            : `校验未通过：${Object.keys(fields ?? {}).join('、')}`
        })
        return valid
      }
      const valid = Boolean(await form.value?.validate())
      validation.value = valid ? '校验通过' : '校验未通过'
      return valid
    } catch {
      validation.value = '校验未通过'
      return false
    }
  }
  const validateContact = async (): Promise<void> => {
    try {
      await form.value?.validateField('contact')
      validation.value = '联系人校验通过'
    } catch {
      validation.value = '联系人校验未通过'
    }
  }
  const validateFrozen = async (): Promise<void> => {
    model.value.frozenValue = ''
    try {
      await form.value?.validateField('frozenValue')
    } catch {
      validation.value = '归档负责人校验未通过'
    }
  }
  const submit = async (value: Record<string, unknown>): Promise<void> => {
    if (await validate(false)) output.value = JSON.stringify(value)
  }
</script>
