import {
  restoreAccessoryRecognitionFiles,
  type AccessoryRecognitionRecord
} from '../../../modules/art-supabase-mdm/src/api/modules/accessory-processing'

const tenantId = '11111111-1111-4111-8111-111111111111'
const groupId = '22222222-2222-4222-8222-222222222222'
const record: AccessoryRecognitionRecord = {
  id: 'test-record',
  tenantId,
  createTime: '',
  projectName: '',
  drawingName: '',
  confidence: 1,
  warnings: [],
  imageUrls: [
    `https://example.test/storage/v1/object/sign/mdm-accessory-processing/${tenantId}/${groupId}/page/source.png`
  ],
  items: Array.from({ length: 8 }, (_, index) => ({
    rowNo: index + 1,
    name: `明细-${index + 1}`,
    widthMm: null,
    lengthM: 1,
    quantity: 1,
    materialColor: '',
    remark: '',
    sketch: null
  }))
}
const output = document.querySelector('#restore-result')
if (new URLSearchParams(location.search).has('invalid-tenant')) {
  record.tenantId = '44444444-4444-4444-8444-444444444444'
}
void restoreAccessoryRecognitionFiles(record)
  .then((result) => {
    if (output) output.textContent = JSON.stringify(result)
  })
  .catch((error: unknown) => {
    if (output) output.textContent = error instanceof Error ? error.message : '恢复失败'
  })
