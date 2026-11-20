<template>
  <main class="mx-auto min-w-0 max-w-4xl space-y-4 p-4">
    <ArtSectionCard title="业务录入" :show-scrollbar="false" data-testid="entry-form">
      <ArtForm
        ref="form"
        v-model="entry"
        :items="entryItems"
        :rules="rules"
        :span="24"
        v-bind="publicFormProps"
        @submit="entrySubmits++"
      />
      <ElButton @click="validateEntry">校验录入</ElButton>
      <output aria-label="录入校验">{{ validation }}</output>
      <template v-if="publicFormProp">
        <div class="mt-4 flex flex-wrap gap-2">
          <ElButton
            v-for="mode in publicPropModes"
            :key="mode.value"
            :aria-pressed="publicPropMode === mode.value"
            @click="publicPropMode = mode.value"
            >{{ mode.label }}</ElButton
          >
          <ElButton @click="resetEntry">重置录入</ElButton>
        </div>
        <output data-testid="public-form-prop-state" hidden>{{ publicPropState }}</output>
        <output data-testid="entry-submits" hidden>{{ entrySubmits }}</output>
        <output data-testid="entry-validations" hidden>{{ entryValidations }}</output>
      </template>
    </ArtSectionCard>
    <ArtSectionCard title="表格查询" :show-scrollbar="false" data-testid="search-form">
      <ArtSearchBar
        v-model="query"
        :items="queryItems"
        :rules="queryRules"
        :label-position="queryLabel"
        :span="12"
        @search="search"
        @reset="resets++"
      />
      <output aria-label="查询结果">{{ output }}</output>
      <output aria-label="重置次数">{{ resets }}</output>
    </ArtSectionCard>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElButton, type FormRules } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSearchBar from '@/components/core/forms/art-search-bar/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'

  const params = new URLSearchParams(location.search)
  const publicFormPropNames = [
    'inlineMessage',
    'showMessage',
    'statusIcon',
    'hideRequiredAsterisk'
  ] as const
  type PublicFormBoolean = (typeof publicFormPropNames)[number]
  const publicFormProp = publicFormPropNames.find(
    (name) => name === params.get('public-form-props')
  )
  const publicPropModes = [
    { value: 'default', label: '使用默认属性' },
    { value: 'enabled', label: '启用表单属性' },
    { value: 'disabled', label: '关闭表单属性' },
    { value: 'undefined', label: '传入未设置值' }
  ] as const
  const publicPropMode = ref<(typeof publicPropModes)[number]['value']>('default')
  const publicFormProps = computed<Partial<Record<PublicFormBoolean, boolean | undefined>>>(() => {
    if (!publicFormProp || publicPropMode.value === 'default') return {}
    return {
      [publicFormProp]:
        publicPropMode.value === 'undefined' ? undefined : publicPropMode.value === 'enabled'
    }
  })
  const publicPropState = computed(() =>
    JSON.stringify({
      mode: publicPropMode.value,
      present: publicFormProp ? Object.hasOwn(publicFormProps.value, publicFormProp) : false,
      value: publicFormProp ? String(publicFormProps.value[publicFormProp]) : 'undefined'
    })
  )
  const form = ref<InstanceType<typeof ArtForm>>()
  const entry = ref({ name: '', ...(publicFormProp ? { reference: '' } : {}) })
  const query = ref({ keyword: '' })
  const validation = ref('待校验')
  const output = ref('待查询')
  const resets = ref(0)
  const entrySubmits = ref(0)
  const entryValidations = ref(0)
  const multilineError = params.has('multiline-error')
  const inlineError = params.has('inline-error')
  const entryItems: FormItem[] = [
    {
      key: 'name',
      label: '业务名称',
      type: 'input',
      formItemProps: inlineError ? { inlineMessage: true } : undefined
    },
    ...(publicFormProp
      ? [
          {
            key: 'reference',
            label: '参考编码',
            type: 'input' as const,
            formItemProps:
              publicFormProp === 'inlineMessage'
                ? { inlineMessage: false }
                : publicFormProp === 'showMessage'
                  ? { showMessage: false }
                  : undefined
          }
        ]
      : [])
  ]
  const queryItems: FormItem[] = [{ key: 'keyword', label: '关键词', type: 'input' }]
  const queryLabel = params.get('query-label') === 'top' ? 'top' : 'right'
  const queryRules: FormRules | undefined = params.has('query-error')
    ? { keyword: [{ required: true, message: '请填写查询关键词', trigger: 'blur' }] }
    : undefined
  const rules: FormRules = {
    name: multilineError
      ? [
          {
            validator: (_rule, value, callback) => {
              if (typeof value === 'string' && value.trim()) callback()
              else
                callback(
                  new Error(
                    '请填写完整业务名称并确认所属业务范围，名称应包含负责单位和具体事项，以便后续查询、审核及业务关联时准确识别。'
                  )
                )
            }
          }
        ]
      : [{ required: true, message: '请填写业务名称' }],
    ...(publicFormProp ? { reference: [{ required: true, message: '请填写参考编码' }] } : {})
  }

  async function validateEntry() {
    validation.value = (await form.value?.validate(() => undefined)) ? '校验通过' : '请完善录入'
    entryValidations.value++
  }

  function resetEntry() {
    form.value?.reset()
    validation.value = '已重置'
  }

  function search(value: Record<string, unknown>) {
    output.value = JSON.stringify(value)
  }
</script>
