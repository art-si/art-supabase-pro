<template>
  <ArtSectionCard
    title="常见响应格式"
    subtitle="以下内容仅为格式示例，不是实时接口响应；实际结果以调用区显示的请求编号和版本为准。"
    preserve-content-structure
  >
    <ElTabs v-model="activeFormat" class="min-w-0">
      <ElTabPane label="Java 服务" name="java">
        <p class="mb-2 text-sm text-g-700">按业务码判定成功，再从 data 提取记录和总数。</p>
        <pre class="max-h-64 overflow-auto rounded-lg bg-g-100 p-3 text-xs leading-6 text-g-900">{{
          examples.java
        }}</pre>
      </ElTabPane>
      <ElTabPane label="Supabase" name="supabase">
        <p class="mb-2 text-sm text-g-700">记录来自响应数组；总数可从受控 Content-Range 读取。</p>
        <pre class="max-h-64 overflow-auto rounded-lg bg-g-100 p-3 text-xs leading-6 text-g-900">{{
          examples.supabase
        }}</pre>
      </ElTabPane>
      <ElTabPane label="CloudBase" name="cloudbase">
        <p class="mb-2 text-sm text-g-700">按声明的业务码和数据路径解析，输出只保留白名单字段。</p>
        <pre class="max-h-64 overflow-auto rounded-lg bg-g-100 p-3 text-xs leading-6 text-g-900">{{
          examples.cloudbase
        }}</pre>
      </ElTabPane>
    </ElTabs>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'

  const activeFormat = ref<'java' | 'supabase' | 'cloudbase'>('java')
  const examples = {
    java: JSON.stringify(
      {
        code: 200,
        msg: '成功',
        data: {
          records: [
            { id: 'J-001', name: '验收示例一' },
            { id: 'J-002', name: '验收示例二' }
          ],
          total: 2
        }
      },
      null,
      2
    ),
    supabase: JSON.stringify(
      [
        { id: 'S-001', name: '验收示例一' },
        { id: 'S-002', name: '验收示例二' }
      ],
      null,
      2
    ),
    cloudbase: JSON.stringify(
      {
        code: 'SUCCESS',
        data: {
          list: [
            { id: 'C-001', name: '验收示例一' },
            { id: 'C-002', name: '验收示例二' }
          ],
          count: 2
        }
      },
      null,
      2
    )
  } as const
</script>
