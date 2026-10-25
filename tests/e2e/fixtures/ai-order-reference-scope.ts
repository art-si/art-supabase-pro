import { useAiOrderReferenceMatcher } from '../../../modules/art-supabase-tms/src/views/order-open/modules/use-ai-order-reference-matcher'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const output = document.querySelector('#reference-result')

void useAiOrderReferenceMatcher()
  .resolveReferences(
    {
      originStationName: '平台发货站',
      shippingCustomerName: new URLSearchParams(location.search).has('no-customer')
        ? ''
        : '平台客户',
      cargoItems: new URLSearchParams(location.search).has('bulk')
        ? Array.from({ length: 14 }, (_, index) => ({ cargoName: `货物-${index % 7}` }))
        : [{ cargoName: '平台货物' }]
    },
    platformTenantId,
    true
  )
  .then((result) => {
    if (output) output.textContent = JSON.stringify(result)
  })
  .catch((error: unknown) => {
    if (output) output.textContent = error instanceof Error ? error.message : '匹配失败'
  })
