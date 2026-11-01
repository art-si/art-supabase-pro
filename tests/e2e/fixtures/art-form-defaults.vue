<template>
  <main class="mx-auto min-w-0 max-w-4xl space-y-4 p-4">
    <ArtSectionCard title="业务录入" :show-scrollbar="false" data-testid="entry-form">
      <ArtForm ref="form" v-model="entry" :items="entryItems" :rules="rules" :span="24" />
      <ElButton @click="validateEntry">校验录入</ElButton>
      <output aria-label="录入校验">{{ validation }}</output>
    </ArtSectionCard>
    <ArtSectionCard title="表格查询" :show-scrollbar="false" data-testid="search-form">
      <ArtSearchBar
        v-model="query"
        :items="queryItems"
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
  import { ref } from 'vue'
  import { ElButton, type FormRules } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSearchBar from '@/components/core/forms/art-search-bar/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'

  const form = ref<InstanceType<typeof ArtForm>>()
  const entry = ref({ name: '' })
  const query = ref({ keyword: '' })
  const validation = ref('待校验')
  const output = ref('待查询')
  const resets = ref(0)
  const entryItems: FormItem[] = [{ key: 'name', label: '业务名称', type: 'input' }]
  const queryItems: FormItem[] = [{ key: 'keyword', label: '关键词', type: 'input' }]
  const rules: FormRules = { name: [{ required: true, message: '请填写业务名称' }] }

  async function validateEntry() {
    validation.value = (await form.value?.validate(() => undefined)) ? '校验通过' : '请完善录入'
  }

  function search(value: Record<string, unknown>) {
    output.value = JSON.stringify(value)
  }
</script>
