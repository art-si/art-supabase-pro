import { useSupabase } from '@/hooks/core/useSupabase'
import {
  parseMainlineScreenOverview,
  type MainlineScreenOverview
} from './transport-mainline-screen.model'

export type {
  MainlineScreenOverview,
  MainlineScreenOrder,
  MainlineScreenEntity
} from './transport-mainline-screen.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchMainlineScreenOverview(): Promise<MainlineScreenOverview> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_mainline_screen_overview_secure'),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '运营大屏加载失败，请刷新后重试'
    }
  )
  return parseMainlineScreenOverview(result.data)
}
