<template>
  <main class="mx-auto max-w-3xl p-4">
    <div class="mb-4 flex gap-3">
      <ElButton @click="validate(false)">校验全部</ElButton>
      <ElButton @click="validate(true)">回调校验</ElButton>
      <ElButton @click="form?.focusField('street')">定位详细地址</ElButton>
      <ElButton @click="form?.reset()">重置</ElButton>
    </div>
    <output aria-label="校验结果">{{ result }}</output>
    <ArtForm
      ref="form"
      v-model="model"
      v-model:active-tab="activeTab"
      :items="custom ? [] : items"
      :custom-layout="custom"
      :rules="rules"
      label-position="top"
    >
      <template v-if="custom" #default>
        <ElTabs v-model="activeTab">
          <ElTabPane name="general" label="客户信息" data-art-form-tab="general">
            <ElFormItem prop="customer" label="客户"
              ><ElInput v-model="model.customer" aria-label="客户"
            /></ElFormItem>
          </ElTabPane>
          <ElTabPane name="address" label="联系地址" data-art-form-tab="address">
            <ElFormItem prop="street" label="详细地址"
              ><ElInput v-model="model.street" aria-label="详细地址"
            /></ElFormItem>
          </ElTabPane>
        </ElTabs>
      </template>
      <template #addressPicker>
        <ElFormItem prop="street" label="详细地址"
          ><ElInput v-model="model.street" aria-label="详细地址"
        /></ElFormItem>
      </template>
    </ArtForm>
  </main>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import { ElButton, ElTabs, ElTabPane, ElFormItem, ElInput, type FormRules } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  const custom = new URLSearchParams(location.search).has('custom')
  const form = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('general')
  const model = ref({ customer: '客户甲', street: '' })
  const items: FormItem[] = [
    { key: 'general', label: '客户信息', type: 'tab' },
    { key: 'customer', label: '客户', type: 'input', props: { 'aria-label': '客户' } },
    { key: 'address', label: '联系地址', type: 'tab' },
    { key: 'addressPicker', label: '', type: 'slot' }
  ]
  const rules: FormRules = {
    customer: [{ required: true, message: '请填写客户' }],
    street: [{ required: true, message: '请填写详细地址' }]
  }
  const result = ref('未校验')
  async function validate(callback: boolean): Promise<void> {
    try {
      if (callback)
        await form.value?.validate((valid) => {
          result.value = valid ? '通过' : '未通过'
        })
      else result.value = (await form.value?.validate()) ? '通过' : '未通过'
    } catch {
      result.value = '未通过'
    }
  }
</script>
