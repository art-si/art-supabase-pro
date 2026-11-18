<template>
  <div
    class="art-cascader"
    :title="picker?.presentText || (typeof $attrs.title === 'string' ? $attrs.title : undefined)"
  >
    <ElCascader
      ref="picker"
      v-bind="{ ...$attrs, ...forwardedSettings }"
      :popper-class="['art-cascader-popper', settings.popperClass]"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change', $event)"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
      @clear="emit('clear')"
      @remove-tag="emit('removeTag', $event)"
      @expand-change="handleExpandChange"
      @visible-change="handleVisibleChange"
    >
      <template #default="scope">
        <slot v-bind="scope">
          <span :title="scope.node.label">{{ scope.node.label }}</span>
        </slot>
      </template>
      <template #suggestion-item="scope">
        <slot name="suggestion-item" v-bind="scope">
          <span :title="scope.item.text">{{ scope.item.text }}</span>
          <ElIcon v-if="scope.item.checked"><Check /></ElIcon>
        </slot>
      </template>
      <template
        v-for="name in Object.keys($slots).filter(
          (name) => name !== 'default' && name !== 'suggestion-item'
        )"
        :key="name"
        #[name]="scope"
      >
        <slot :name="name" v-bind="scope" />
      </template>
    </ElCascader>
  </div>
</template>

<script setup lang="ts">
  import { Check } from '@element-plus/icons-vue'
  import {
    ElCascader,
    ElIcon,
    cascaderEmits,
    cascaderProps,
    type CascaderInstance,
    type CascaderValue
  } from 'element-plus'
  import { computed, nextTick, useTemplateRef } from 'vue'

  defineOptions({ name: 'ArtCascader', inheritAttrs: false })

  const settings = defineProps(cascaderProps)
  const forwardedSettings = computed(
    () =>
      ({
        ...settings,
        showCheckedStrategy: settings.showCheckedStrategy === 'parent' ? 'parent' : 'child'
      }) as const
  )
  const emit = defineEmits(cascaderEmits)
  const picker = useTemplateRef<CascaderInstance>('picker')

  const revealLastMenu = async () => {
    await nextTick()
    const panel = picker.value?.contentRef?.querySelector<HTMLElement>('.el-cascader-panel')
    if (panel && panel.scrollWidth > panel.clientWidth) panel.scrollLeft = panel.scrollWidth
  }

  const handleExpandChange = (value: CascaderValue) => {
    void revealLastMenu()
    emit('expandChange', value)
  }

  const handleVisibleChange = (visible: boolean) => {
    if (visible) void revealLastMenu()
    emit('visibleChange', visible)
  }
</script>

<style lang="scss">
  .art-cascader {
    inline-size: 100%;
    min-inline-size: 0;

    > .el-cascader {
      inline-size: 100%;
    }
  }

  .el-cascader__dropdown.art-cascader-popper {
    max-inline-size: calc(100vw - 2 * var(--art-space-2));

    .el-cascader-panel {
      max-inline-size: 100%;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scrollbar-width: thin;
    }

    .el-cascader-menu {
      flex: none;
      max-inline-size: min(320px, 100%);
    }
  }
</style>
