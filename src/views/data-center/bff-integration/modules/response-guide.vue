<template>
  <div class="min-w-0 space-y-4">
    <p class="rounded-lg bg-g-100 px-4 py-3 text-sm leading-6 text-g-700">
      以下内容仅为格式示例，不是实时接口响应；实际结果以调用区显示的请求编号和版本为准。
    </p>
    <ElTabs v-model="activeFormat" class="min-w-0">
      <ElTabPane label="Java 服务" name="java">
        <p class="mb-3 text-sm text-g-700">按业务码判定成功，再从 data 提取记录和总数。</p>
        <PlanCodePreview title="Java 服务响应示例" :code="examples.java" language="json" expanded />
      </ElTabPane>
      <ElTabPane label="Supabase" name="supabase">
        <p class="mb-3 text-sm text-g-700">记录来自响应数组；总数可从受控 Content-Range 读取。</p>
        <PlanCodePreview
          title="Supabase 响应示例"
          :code="examples.supabase"
          language="json"
          expanded
        />
      </ElTabPane>
      <ElTabPane label="CloudBase" name="cloudbase">
        <p class="mb-3 text-sm text-g-700">按声明的业务码和数据路径解析，输出只保留白名单字段。</p>
        <PlanCodePreview
          title="CloudBase 响应示例"
          :code="examples.cloudbase"
          language="json"
          expanded
        />
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
  import PlanCodePreview from '@/views/data-center/sql-console/modules/plan-code-preview.vue'

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
