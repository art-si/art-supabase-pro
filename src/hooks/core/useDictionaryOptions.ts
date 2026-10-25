import { shallowReactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/modules/user'
import { toDictionaryOption } from '@/utils/form/option'

export interface DictionarySelectOption<T extends string | number | boolean = string> {
  label: string
  value: T
}

/** Keep form and search options reactive when a dictionary is loaded after setup. */
export function useDictionaryOptions<T extends string | number | boolean = string>(
  code: string,
  mapValue?: (value: string) => T
): DictionarySelectOption<T>[] {
  const userStore = useUserStore()
  const options = shallowReactive<DictionarySelectOption<T>[]>([])

  watch(
    () => userStore.getDictMap[code],
    (items) => {
      options.splice(
        0,
        options.length,
        ...(items ?? [])
          .filter((item) => !item.status || item.status === '1')
          .map((item) => ({
            label: toDictionaryOption(item).label || item.value,
            value: mapValue ? mapValue(item.value) : (item.value as T)
          }))
      )
      // 登录初始化或切换租户会清空字典缓存。此时重新加载当前页面仍在使用的字典。
      if (!items) {
        void userStore.ensureDictLoaded(code).catch(() => {
          ElMessage({ type: 'error', message: '字典选项加载失败，请刷新页面重试', grouping: true })
        })
      }
    },
    { immediate: true }
  )

  return options
}
