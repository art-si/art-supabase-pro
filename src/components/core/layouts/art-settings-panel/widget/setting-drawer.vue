<template>
  <div class="setting-drawer">
    <ElDrawer
      :size="drawerSize"
      v-model="visible"
      :with-header="false"
      modal-class="setting-modal"
      @open="emit('open')"
      @close="emit('close')"
    >
      <ElScrollbar class="setting-drawer__scrollbar">
        <div class="drawer-con">
          <slot />
        </div>
      </ElScrollbar>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
  interface Emits {
    (e: 'open'): void
    (e: 'close'): void
  }

  const visible = defineModel<boolean>({ required: true })
  const emit = defineEmits<Emits>()
  const { width } = useWindowSize()
  const drawerSize = computed(() => (width.value <= 640 ? '100%' : '420px'))
</script>
