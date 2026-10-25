import { createSharedComposable, useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import { computed, type ComputedRef } from 'vue'
import { festivalConfigList } from '@/config/modules/festival'
import type { FestivalConfig } from '@/types/config'

/** Read-only festival state shared by settings and display without creating effect controllers. */
export const useCurrentFestival = createSharedComposable(
  (): {
    currentFestivalData: ComputedRef<FestivalConfig | undefined>
    currentFestivalDate: ComputedRef<string>
  } => {
    const now = useNow({
      scheduler: (update) =>
        useIntervalFn(update, 60_000, { immediate: festivalConfigList.length > 0 })
    })
    const today = useDateFormat(now, 'YYYY-MM-DD')
    const currentFestivalData = computed(() =>
      festivalConfigList.find((festival) => {
        if (!festival.endDate) return today.value === festival.date
        const current = new Date(today.value)
        return current >= new Date(festival.date) && current <= new Date(festival.endDate)
      })
    )
    return { currentFestivalData, currentFestivalDate: today }
  }
)
