<template>
  <main class="mx-auto min-w-0 space-y-5 p-6" style="max-width: 1080px">
    <h1>详细地址组合输入</h1>
    <section v-for="state in states" :key="state.key" :data-state="state.key">
      <ElForm
        label-position="top"
        :model="state"
        :rules="state.key === 'error' ? rules : undefined"
      >
        <ArtAddressPicker
          v-model:address-detail="state.address"
          :detail-label="state.label"
          :disabled="state.key === 'disabled'"
          :show-locate-button="state.key === 'disabled' || state.key === 'locating'"
          :show-coordinate-hint="false"
          address-detail-prop="address"
          hide-region-selector
          amap-key="style-test-key"
        />
      </ElForm>
    </section>
  </main>
</template>

<script setup lang="ts">
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import type { FormRules } from 'element-plus'

  const rules: FormRules = {
    address: [{ required: true, message: '请填写详细地址', trigger: 'blur' }]
  }

  const states = ref([
    { key: 'empty', label: '空值地址', address: '' },
    { key: 'filled', label: '已填写地址', address: '上海市浦东新区验收园区一号楼 301 室' },
    { key: 'disabled', label: '不可编辑地址', address: '上海市浦东新区验收园区二号楼' },
    { key: 'locating', label: '定位处理中', address: '' },
    { key: 'error', label: '校验错误地址', address: '' }
  ])
</script>
