import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { fetchVehicleReminderCompanyOptions } from '../../../modules/art-supabase-vms/src/api/providers/supabase/vehicle/archive'
import { fetchVehicleReminderViewRiskOverview } from '../../../modules/art-supabase-vms/src/api/providers/supabase/vehicle/reminders'
import VehicleReminderRiskOverview from '../../../modules/art-supabase-vms/src/views/reminder-manage/modules/vehicle-reminder-risk-overview.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const result = ref('尚未查询')
const companyName = ref('')
const app = createApp({
  render: () =>
    new URLSearchParams(location.search).has('risk-ui')
      ? h('main', [
          h('input', {
            'aria-label': '公司筛选',
            value: companyName.value,
            onInput: (event: Event) => {
              if (event.target instanceof HTMLInputElement) companyName.value = event.target.value
            }
          }),
          h(VehicleReminderRiskOverview, {
            title: '保险到期',
            description: '查看当前风险',
            filters: { companyName: companyName.value },
            fetchFn: (params: Api.Vms.ReminderManage.VehicleReminderSearchParams) =>
              fetchVehicleReminderViewRiskOverview('vehicle_reminder_insurance_expiry', params)
          })
        ])
      : h('main', [
          h(
            'button',
            {
              onClick: async () => {
                if (new URLSearchParams(location.search).has('risk')) {
                  try {
                    result.value = JSON.stringify(
                      await fetchVehicleReminderViewRiskOverview(
                        'vehicle_reminder_insurance_expiry',
                        {}
                      )
                    )
                  } catch {
                    result.value = '风险概览加载失败'
                  }
                  return
                }
                const response = await fetchVehicleReminderCompanyOptions()
                result.value = JSON.stringify({
                  data: response.data,
                  failed: Boolean(response.error)
                })
              }
            },
            '查询公司'
          ),
          h('output', { 'data-testid': 'company-result' }, result.value)
        ])
})
app.use(store)
app.use(language)
app.mount('#company-options-preview')
