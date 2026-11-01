<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <h1>公共控件双向绑定</h1>
    <ArtStatusSegmented v-model="status" :options="statuses" />
    <label>
      单选用户
      <ArtUserSelect
        v-model="single"
        aria-label="单选用户"
        :options="users"
        @change="changes.push($event)"
      />
    </label>
    <ArtIconPicker v-model="icon" />
    <label>
      多选用户
      <ArtUserSelect
        v-model="multiple"
        aria-label="多选用户"
        :options="users"
        multiple
        @change="changes.push($event)"
      />
    </label>
    <ElButton @click="visible = true">打开设置</ElButton>
    <SettingDrawer v-model="visible" @open="opens++" @close="closes++">
      <h2>设置内容</h2>
      <ElButton @click="visible = false">关闭设置</ElButton>
    </SettingDrawer>
    <output class="break-all text-xs" data-testid="model-state">
      {{ JSON.stringify({ status, single, multiple, icon, visible, opens, closes, changes }) }}
    </output>
  </main>
</template>

<script setup lang="ts">
  import ArtStatusSegmented, {
    type ArtStatusSegmentedValue
  } from '@/components/core/forms/art-status-segmented/index.vue'
  import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
  import ArtIconPicker from '@/components/core/forms/art-icon-picker/index.vue'
  import type { ArtUserSelectValue } from '@/components/core/forms/art-user-select/types'
  import SettingDrawer from '@/components/core/layouts/art-settings-panel/widget/setting-drawer.vue'

  const status = ref<ArtStatusSegmentedValue>('all')
  const single = ref<ArtUserSelectValue>('user-a')
  const multiple = ref<ArtUserSelectValue>([])
  const icon = ref('ri:home-line')
  const changes = ref<ArtUserSelectValue[]>([])
  const visible = ref(false)
  const opens = ref(0)
  const closes = ref(0)
  const statuses = [
    { label: '全部状态', value: 'all', count: 3 },
    { label: '未启用', value: false, count: 2 },
    { label: '数量为零', value: 0, count: 0 }
  ]
  const users = [
    { value: 'user-a', label: '测试甲', nickName: '测试甲', userEmail: 'a@example.test' },
    { value: 'user-b', label: '测试乙', nickName: '测试乙', userEmail: 'b@example.test' }
  ]
</script>
