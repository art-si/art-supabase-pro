<template>
  <ArtSectionCard
    title="使用说明与示例"
    subtitle="把固定的只读查询变成可带参数调用的地址，应用只需传入参数值。"
    :show-scrollbar="false"
  >
    <template v-if="definitions.length" #actions>
      <ElButton size="small" :aria-expanded="showContent" @click="expanded = !expanded">
        <ArtSvgIcon :icon="showContent ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'" />
        {{ showContent ? '收起使用说明与示例' : '展开使用说明与示例' }}
      </ElButton>
    </template>
    <div v-if="showContent" class="flex min-w-0 flex-col gap-4">
      <ol
        class="m-0 grid list-none grid-cols-1 gap-3 p-0 text-xs leading-5 text-g-700 sm:grid-cols-3"
      >
        <li
          ><strong class="block text-g-900">1. 选择 API</strong
          >选择已获授权的接口；没有可用接口时，请联系管理员授权。</li
        >
        <li
          ><strong class="block text-g-900">2. 填参并调用</strong>核对参数后点击“调用
          API”，在下方查看只读结果。</li
        >
        <li
          ><strong class="block text-g-900">3. 接入应用</strong
          >在“接入说明”复制地址与代码，替换访问令牌和项目公开 Key。</li
        >
      </ol>
      <div class="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">
        <article
          v-for="item in examples"
          :key="item.sample.slug"
          :aria-label="item.sample.name"
          class="flex min-w-0 flex-col gap-3 rounded bg-g-100 p-3"
        >
          <div class="min-w-0">
            <strong class="block break-words text-sm text-g-900">{{ item.sample.name }}</strong>
            <p class="mb-0 mt-1 text-xs leading-5 text-g-700">{{ item.sample.description }}</p>
          </div>
          <dl class="m-0 flex flex-col gap-1 text-xs leading-5 text-g-700">
            <dt class="font-medium">示例输入</dt>
            <dd class="m-0 break-words font-mono">{{ item.sample.inputHint }}</dd>
            <dt class="mt-1 font-medium">预期输出</dt>
            <dd class="m-0 break-words">{{ item.sample.outputHint }}</dd>
          </dl>
          <div class="mt-auto flex min-w-0 flex-wrap items-center gap-2">
            <template v-if="item.definition">
              <ElButton
                size="small"
                :disabled="disabled"
                @click="emit('open-sample', item.sample.slug)"
              >
                打开并填入参数
              </ElButton>
              <span class="text-xs text-g-700">{{
                item.definition.enabled ? '已启用' : '已停用，需启用后调用'
              }}</span>
            </template>
            <ElButton
              v-else-if="canManage"
              size="small"
              :disabled="disabled"
              @click="emit('create-sample', item.sample.slug)"
              >用此示例新建</ElButton
            >
            <p v-else class="m-0 text-xs leading-5 text-g-700"
              >当前未获此示例 API 授权，请联系平台管理员。</p
            >
          </div>
        </article>
      </div>
      <p class="m-0 text-xs leading-5 text-g-700">
        示例仅使用模拟数据，不读取业务表。预期输出对应上述演示输入，以实际调用结果为准；打开示例只会填入参数，不会自动调用。
        <template v-if="canManage"
          >新建示例只预填草稿；核对所属租户与授权账号，点击“发布 API”后才会保存。</template
        >
      </p>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { SqlQueryApiDefinition } from '@/types/sql-query-api'
  import { getSqlQueryApiSample, sqlQueryApiSamples } from './query-api-samples'

  const props = defineProps<{
    definitions: readonly SqlQueryApiDefinition[]
    canManage: boolean
    disabled: boolean
  }>()
  const emit = defineEmits<{
    'open-sample': [slug: string]
    'create-sample': [slug: string]
  }>()
  const expanded = ref(false)
  const showContent = computed(() => !props.definitions.length || expanded.value)
  const examples = computed(() =>
    sqlQueryApiSamples.map((sample) => {
      const matches = props.definitions.filter(
        (definition) => getSqlQueryApiSample(definition)?.slug === sample.slug
      )
      return { sample, definition: matches.find((definition) => definition.enabled) ?? matches[0] }
    })
  )
</script>
