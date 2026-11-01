<template>
  <main class="min-w-0 p-4">
    <template v-if="mode === 'scroll'">
      <h1>工作区滚动</h1>
      <div id="app-main">
        <ElScrollbar class="app-main__scrollbar" wrap-class="app-main__scroll-wrap" height="420px">
          <div style="height: 1600px">工作区测试内容</div>
        </ElScrollbar>
      </div>
      <ArtBackToTop />
    </template>
    <template v-else>
      <h1>资源{{ multiple ? '多选' : '单选' }}</h1>
      <div class="my-4 flex flex-wrap gap-3">
        <ElButton @click="model = multiple ? [secondUrl] : secondUrl">外部选择第二项</ElButton>
        <ElButton @click="model = multiple ? [] : undefined">清空外部选择</ElButton>
        <ElButton @click="tenant = '22222222-2222-4222-8222-222222222222'">切换资源租户</ElButton>
      </div>
      <div style="height: 550px">
        <ResourcePanel
          v-model="model"
          :multiple="multiple"
          :limit="2"
          :resource-tenant-id="tenant"
          @update:model-value="updates++"
          @confirm="confirmed = $event.map((resource) => resource.url)"
        />
      </div>
      <output class="break-all" data-testid="selection-state">
        {{ JSON.stringify({ model, originalModel, confirmed, updates }) }}
      </output>
    </template>
  </main>
</template>

<script setup lang="ts">
  import ResourcePanel from '@/components/core/forms/art-resource-picker/panel.vue'
  import ArtBackToTop from '@/components/core/base/art-back-to-top/index.vue'

  const parameters = new URLSearchParams(location.search)
  const mode = parameters.get('mode')
  const multiple = parameters.has('multiple')
  const tenant = ref('11111111-1111-4111-8111-111111111111')
  const secondUrl = 'https://example.test/resource-b.pdf'
  const model = ref<string | string[] | undefined>(multiple ? [] : undefined)
  const originalModel = model.value
  const confirmed = ref<Array<string | undefined>>([])
  const updates = ref(0)
</script>
