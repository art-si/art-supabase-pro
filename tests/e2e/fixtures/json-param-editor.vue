<template>
  <main class="p-6">
    <button type="button" @click="openAppearance">编辑外观配置</button>
    <button type="button" @click="openWebsite">编辑网站配置</button>
    <button type="button" @click="openGeofence">编辑围栏配置</button>
    <pre data-testid="applied-value">{{ appliedValue }}</pre>
    <JsonValueDrawer ref="drawerRef" />
  </main>
</template>

<script setup lang="ts">
  import { editor } from 'monaco-editor'
  import JsonValueDrawer from '@/views/system/system-param/modules/json-value-drawer.vue'

  declare global {
    interface Window {
      jsonParamEditorFixture: {
        getDraft: () => string
        setDraft: (value: string) => void
        getLanguage: () => string
        getSyntaxErrors: () => string[]
      }
    }
  }

  const drawerRef = ref<InstanceType<typeof JsonValueDrawer>>()
  const appliedValue = ref('')
  const activeParamKey = ref('')

  const openAppearance = () => {
    activeParamKey.value = 'ui.appearance.config'
    void drawerRef.value?.handleOpen({
      label: '参数值',
      paramKey: 'ui.appearance.config',
      fieldKey: 'paramValue',
      value: '{"globalFocusMode":true,"menuOpenWidth":230,"menuType":"left"}',
      onApply: (value: string) => {
        appliedValue.value = value
      }
    })
  }

  const openWebsite = () => {
    activeParamKey.value = 'website.config'
    void drawerRef.value?.handleOpen({
      label: '参数值',
      paramKey: 'website.config',
      fieldKey: 'paramValue',
      value:
        '{"enabled":true,"authChannels":[{"key":"wechat","provider":"custom:wechat","enabled":true}]}',
      onApply: (value: string) => {
        appliedValue.value = value
      }
    })
  }

  const openGeofence = () => {
    activeParamKey.value = 'tms.geofence.config'
    void drawerRef.value?.handleOpen({
      label: '参数值',
      paramKey: 'tms.geofence.config',
      fieldKey: 'paramValue',
      value: '{"enabled":true,"loadingRadiusM":1000}',
      onApply: (value: string) => {
        appliedValue.value = value
      }
    })
  }

  const currentModel = () => {
    const model = editor
      .getModels()
      .find((item) =>
        item.uri.toString().includes(`inmemory://system-param/${activeParamKey.value}/`)
      )
    if (!model) throw new Error('JSON editor model is not ready')
    return model
  }

  window.jsonParamEditorFixture = {
    getDraft: () => currentModel().getValue(),
    setDraft: (value) => currentModel().setValue(value),
    getLanguage: () => currentModel().getLanguageId(),
    getSyntaxErrors: () =>
      editor
        .getModelMarkers({ resource: currentModel().uri })
        .filter((marker) => marker.severity === 8)
        .map((marker) => marker.message)
  }
</script>
