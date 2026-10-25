import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { useTableHeight } from '../../src/hooks/core/useTableHeight'

test('table height follows measured regions and returns to full height when controls disappear', () => {
  const options = {
    showTableHeader: ref(false),
    additionalHeightOffset: ref(0),
    paginationHeight: ref(0),
    tableHeaderHeight: ref(0),
    paginationSpacing: ref(15)
  }
  const { containerHeight } = useTableHeight(options)
  assert.deepEqual(containerHeight.value, { height: '100%' })

  options.showTableHeader.value = true
  assert.deepEqual(containerHeight.value, { height: 'calc(100% - 56px)' })
  options.tableHeaderHeight.value = 80
  options.paginationHeight.value = 30
  assert.deepEqual(containerHeight.value, { height: 'calc(100% - 137px)' })

  options.showTableHeader.value = false
  options.additionalHeightOffset.value = 20
  assert.deepEqual(containerHeight.value, { height: 'calc(100% - 65px)' })
  options.paginationHeight.value = 0
  options.paginationSpacing.value = 500
  assert.deepEqual(containerHeight.value, { height: 'calc(100% - 20px)' })
  options.additionalHeightOffset.value = -20
  assert.deepEqual(containerHeight.value, { height: '100%' })
})
