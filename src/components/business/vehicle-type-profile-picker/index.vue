<template>
  <div class="vehicle-type-profile-picker">
    <div class="vehicle-type-profile-picker__categories">
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="vehicle-type-profile-picker__category"
        :class="{
          'is-active': selectedCategory === category && !!categoryProfiles(category).length
        }"
        :disabled="!categoryProfiles(category).length"
        :aria-pressed="selectedCategory === category && !!categoryProfiles(category).length"
        :title="!categoryProfiles(category).length ? '暂无启用规格，请先维护车型配置' : undefined"
        @click="selectCategory(category)"
      >
        <VehicleTypeArt :category="category" />
        <span>{{ category }}</span>
        <small>{{
          categoryProfiles(category).length
            ? `${categoryProfiles(category).length} 项规格`
            : '暂无可选规格'
        }}</small>
      </button>
    </div>

    <div v-if="profiles.length" class="vehicle-type-profile-picker__specifications">
      <div class="vehicle-type-profile-picker__section-heading">
        <strong>{{ selectedCategory === '按载重' ? '选择载重' : '选择规格 / 车长' }}</strong>
        <span
          >已展示全部
          {{ categoryProfiles(selectedCategory).length }} 项启用规格，选择后可核对容积和载重</span
        >
      </div>
      <div
        v-if="categoryProfiles(selectedCategory).length"
        class="vehicle-type-profile-picker__choices"
      >
        <button
          v-for="profile in categoryProfiles(selectedCategory)"
          :key="profile.id"
          type="button"
          class="vehicle-type-profile-picker__choice"
          :class="{ 'is-active': modelValue === profile.id }"
          :aria-pressed="modelValue === profile.id"
          :aria-label="`${profileLabel(profile)}，容积${metric(profile.volumeM3, '立方米')}，载重${metric(profile.loadTons, '吨')}`"
          @click="emit('update:modelValue', profile.id)"
        >
          {{
            profile.category === '按载重'
              ? metric(profile.loadTons, '吨')
              : metric(profile.lengthM, '米')
          }}
        </button>
      </div>
      <ArtEmptyState
        v-else
        title="该分类尚无启用规格"
        description="可切换其他分类，或联系档案管理员维护车型配置。"
        size="compact"
        :visual-size="72"
      />
    </div>
    <ArtEmptyState
      v-else
      class="mt-6"
      title="暂无已启用的车型规格"
      description="请先在车辆档案维护车型。"
      size="compact"
      :visual-size="72"
    />

    <div v-if="selectedProfile" class="vehicle-type-profile-picker__summary">
      <div class="vehicle-type-profile-picker__summary-image">
        <ElImage
          v-if="selectedProfile.imageUrl"
          :src="selectedProfile.imageUrl"
          :alt="`${profileLabel(selectedProfile)}图片`"
          fit="contain"
        />
        <VehicleTypeArt v-else :category="selectedProfile.category" />
      </div>
      <div class="vehicle-type-profile-picker__summary-content">
        <div class="vehicle-type-profile-picker__summary-title">
          <strong>{{ profileLabel(selectedProfile) }}</strong
          ><span>已选规格</span>
        </div>
        <div class="vehicle-type-profile-picker__metrics">
          <span
            >车长 <b>{{ metric(selectedProfile.lengthM, '米') }}</b></span
          >
          <span
            >容积 <b>{{ metric(selectedProfile.volumeM3, '立方米') }}</b></span
          >
          <span
            >载重 <b>{{ metric(selectedProfile.loadTons, '吨') }}</b></span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ElImage } from 'element-plus'
  import { groupBy } from 'lodash-es'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import VehicleTypeArt from './vehicle-type-art.vue'
  import type { VehicleTypeProfileOption } from './types'

  const props = defineProps<{
    profiles: readonly VehicleTypeProfileOption[]
    categories: readonly string[]
    modelValue: string | null | undefined
  }>()
  const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()
  const selectedCategory = ref('')
  const selectedProfile = computed(() =>
    props.profiles.find((profile) => profile.id === props.modelValue)
  )
  const profilesByCategory = computed(() => {
    const groups = new Map(Object.entries(groupBy(props.profiles, 'category')))
    for (const rows of groups.values())
      rows.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    return groups
  })
  const categoryProfiles = (category: string): VehicleTypeProfileOption[] =>
    profilesByCategory.value.get(category) ?? []

  watch(
    [() => props.profiles, () => props.modelValue],
    () => {
      if (selectedProfile.value) selectedCategory.value = selectedProfile.value.category
      else if (!props.profiles.some((profile) => profile.category === selectedCategory.value))
        selectedCategory.value = props.profiles[0]?.category ?? props.categories[0] ?? ''
    },
    { immediate: true }
  )

  function selectCategory(category: string): void {
    if (!categoryProfiles(category).length || selectedCategory.value === category) return
    selectedCategory.value = category
    emit('update:modelValue', null)
  }

  function metric(value: number | null, unit: string): string {
    return value == null ? '未配置' : `${value} ${unit}`
  }

  function profileLabel(profile: VehicleTypeProfileOption): string {
    const value = profile.category === '按载重' ? profile.loadTons : profile.lengthM
    return value == null
      ? profile.category
      : `${profile.category} · ${metric(value, profile.category === '按载重' ? '吨' : '米')}`
  }
</script>

<style scoped lang="scss">
  .vehicle-type-profile-picker {
    min-width: 0;

    &__categories {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 10px;
    }

    &__category {
      display: grid;
      gap: 6px;
      place-items: center;
      min-width: 0;
      min-height: 130px;
      padding: 10px 8px 12px;
      color: var(--el-text-color-primary);
      cursor: pointer;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--art-control-radius);
      transition:
        border-color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease;

      :deep(.vehicle-type-art) {
        height: 70px;
      }

      span {
        font-size: 13px;
        font-weight: 600;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      &:hover {
        border-color: var(--theme-color);
      }

      &:disabled {
        color: var(--el-text-color-secondary);
        cursor: not-allowed;
        background: var(--el-fill-color-extra-light);

        :deep(.vehicle-type-art) {
          opacity: 0.55;
        }

        &:hover {
          border-color: var(--el-border-color-light);
        }
      }

      &.is-active {
        background: var(--el-color-primary-light-9);
        border-color: var(--theme-color);
        box-shadow: inset 0 0 0 1px var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__specifications {
      margin-top: 24px;
    }

    &__section-heading {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: baseline;
      margin-bottom: 10px;

      strong {
        font-size: 13px;
      }

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__choices {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 8px;
    }

    &__choice {
      min-width: 72px;
      min-height: 36px;
      padding: 6px 12px;
      color: var(--el-text-color-primary);
      cursor: pointer;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color);
      border-radius: var(--art-control-radius);

      &:hover {
        border-color: var(--theme-color);
      }

      &.is-active {
        font-weight: 600;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-color: var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__summary {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      padding: 16px 18px;
      margin-top: 20px;
      font-size: 12px;
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__summary-image {
      display: grid;
      place-items: center;
      min-width: 0;
      height: 72px;
      padding: 4px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);

      :deep(.el-image),
      :deep(.vehicle-type-art) {
        width: 100%;
        height: 100%;
      }
    }

    &__summary-content {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    &__summary-title {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;

      strong {
        font-size: 14px;
      }

      span {
        color: var(--el-color-primary);
      }
    }

    &__metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 24px;
      color: var(--el-text-color-secondary);

      b {
        margin-left: 4px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    @media (width <= 1050px) {
      &__categories {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    }

    @media (width <= 720px) {
      &__categories {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (width <= 460px) {
      &__categories {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }
</style>
