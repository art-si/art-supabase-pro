<template>
  <svg
    class="vehicle-type-art"
    width="148"
    height="72"
    viewBox="0 0 148 72"
    role="img"
    :aria-label="`${category}示意图`"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M8 61h132" stroke="currentColor" stroke-opacity=".18" stroke-width="2" />
    <path d="M15 29h20l7 8v19H10V39z" fill="var(--theme-color)" />
    <path d="M19 32h13l5 6H17z" fill="var(--el-color-info-light-9)" />
    <path d="M10 47h5v5h-5z" fill="var(--el-color-warning)" />
    <path d="M41 51h97v5H40z" fill="var(--art-gray-800)" />
    <template v-if="category === '高栏车'">
      <path d="M44 20h90v29H44z" fill="var(--theme-color)" opacity=".12" />
      <path
        d="M44 20v29m18-29v29m18-29v29m18-29v29m18-29v29m18-29v29M44 20h90M44 34h90M44 49h90"
        stroke="var(--theme-color)"
        stroke-width="2"
      />
    </template>
    <template
      v-else-if="
        category === '厢式货车' ||
        category === '冷藏车' ||
        category === '集卡车' ||
        category === '其他车型' ||
        category === '按载重'
      "
    >
      <path d="M44 18h90v31H44z" fill="var(--theme-color)" />
      <path d="M49 23h80v21H49z" fill="var(--theme-color)" opacity=".7" />
      <path
        v-if="category === '集卡车'"
        d="M61 20v27m18-27v27m18-27v27m18-27v27"
        stroke="white"
        stroke-opacity=".55"
      />
      <path
        v-if="category === '冷藏车'"
        d="M104 34h16m-8-8v16m-6-13 12 10m0-10-12 10"
        stroke="white"
        stroke-linecap="round"
        stroke-width="2"
      />
      <path
        v-if="category === '按载重'"
        d="M82 31h18m-14 5h10m-5-16v23"
        stroke="white"
        stroke-linecap="round"
        stroke-width="2"
      />
    </template>
    <template v-else-if="category === '面包车'">
      <path d="M45 28h67l18 11v10H45z" fill="var(--theme-color)" />
      <path d="M50 31h58v11H50z" fill="var(--el-color-info-light-9)" />
      <path d="M70 30v16m39-15 13 14" stroke="var(--theme-color)" stroke-width="2" />
    </template>
    <template v-else-if="category === '特种车辆'">
      <rect x="50" y="22" width="69" height="25" rx="12" fill="var(--theme-color)" />
      <path d="M53 35h64" stroke="white" stroke-opacity=".7" />
      <path d="M120 34h13v14h-13z" fill="var(--theme-color)" />
    </template>
    <template v-else-if="category === '敞车'">
      <path d="M44 27h90l-7 22H49z" fill="var(--theme-color)" />
      <path d="M47 27h84" stroke="var(--art-gray-800)" stroke-width="2" />
    </template>
    <template v-else>
      <path d="M44 46h90v4H44z" fill="var(--theme-color)" />
      <path
        v-if="category === '半挂车'"
        d="M45 20v26m87-26v26"
        stroke="var(--theme-color)"
        stroke-width="2"
      />
      <path
        v-if="category === '平板车'"
        d="M60 34h25v12H60zm31-7h30v19H91z"
        fill="var(--theme-color)"
        opacity=".35"
      />
    </template>
    <circle cx="29" cy="55" r="8" fill="var(--art-gray-800)" />
    <circle cx="29" cy="55" r="3" fill="var(--el-color-info-light-9)" />
    <circle cx="105" cy="55" r="8" fill="var(--art-gray-800)" />
    <circle cx="105" cy="55" r="3" fill="var(--el-color-info-light-9)" />
    <circle
      v-if="['半挂车', '集卡车', '特种车辆'].includes(category)"
      cx="126"
      cy="55"
      r="8"
      fill="var(--art-gray-800)"
    />
    <circle
      v-if="['半挂车', '集卡车', '特种车辆'].includes(category)"
      cx="126"
      cy="55"
      r="3"
      fill="var(--el-color-info-light-9)"
    />
  </svg>
</template>

<script setup lang="ts">
  defineProps<{ category: string }>()
</script>

<style scoped>
  .vehicle-type-art {
    display: block;
    width: 100%;
    max-width: 148px;
    height: 72px;
    color: var(--el-text-color-secondary);
  }
</style>
