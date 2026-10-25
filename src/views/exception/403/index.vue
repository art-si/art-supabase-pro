<template>
  <ArtPermissionGuard force-denied resource-name="目标页面" show-relogin viewport-centered />
</template>

<script setup lang="ts">
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'

  defineOptions({ name: 'Exception403' })
</script>
