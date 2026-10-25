import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import dayjs from 'dayjs'
import { computed, reactive } from 'vue'
import { formatWithDayjs } from '../../src/utils/time/format'

const scenarios = [
  ['modules/art-supabase-mdm/src/views/engineering/esop/modules/category-dialog.vue', 'initial'],
  ['modules/art-supabase-mdm/src/views/engineering/esop/modules/document-dialog.vue', 'initial'],
  ['modules/art-supabase-pmis/src/views/components/department-setting-dialog.vue', 'initial'],
  ['modules/art-supabase-pmis/src/views/components/repair-task-dialog.vue', 'initial'],
  ['modules/art-supabase-pmis/src/views/components/task-editor-dialog.vue', 'initial'],
  [
    'modules/art-supabase-smis/src/views/basic-data/position-risk-list/modules/risk-control-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/basic-data/position-safety-responsibility/modules/responsibility-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/basic-data/position-work-instruction/modules/work-instruction-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/duplicate-configuration/modules/duplicate-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/inspection-standard/modules/item-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/inspection-standard/modules/standard-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/hazardous-waste-management/hazardous-waste-catalog/modules/category-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/hazardous-waste-management/shared/document-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/qualification-training/training-management/safety-training-record/modules/training-record-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/document-center/all-documents/modules/document-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/document-center/legal-regulation/modules/legal-compliance-evaluation-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/document-center/shared/document-register-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/emergency-rescue/emergency-drill-plan/modules/drill-plan-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/emergency-rescue/emergency-drill-record/modules/drill-record-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/risk-assessment-standard-model/modules/criterion-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/risk-evaluation-control/modules/measure-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/safety-risk-list/modules/safety-risk-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/document-center/shared/document-category-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-hr/src/views/operations/attendance/modules/attendance-dialog.vue',
    'createInitialModel'
  ],
  [
    'modules/art-supabase-hr/src/views/operations/self-service/modules/service-delivery-dialog.vue',
    'createInitialModel'
  ],
  [
    'modules/art-supabase-hr/src/views/personnel/lifecycle/modules/lifecycle-dialog.vue',
    'createInitialModel'
  ],
  [
    'modules/art-supabase-hr/src/views/talent/performance/modules/performance-dialog.vue',
    'createInitialModel'
  ],
  [
    'modules/art-supabase-smis/src/views/basic-data/leave-information/modules/leave-information-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/modules/plan-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/risk-four-color-map/modules/risk-map-scene-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/dual-control-system/risk-control/safety-inspection/modules/safety-inspection-dialog.vue',
    'initial'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/anti-violation-management/announcement-category/modules/announcement-category-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/anti-violation-management/announcement-view/modules/announcement-editor-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/safety-production/anti-violation-management/violation-record/modules/violation-record-dialog.vue',
    'createInitialForm'
  ],
  [
    'modules/art-supabase-smis/src/views/hazardous-waste-management/hazardous-waste-catalog/modules/catalog-dialog.vue',
    'initial'
  ]
] as const

for (const [file, factoryName] of scenarios) {
  test(file + ': editing then creating clears persisted identity', () => {
    const text = readFileSync(new URL('../../' + file, import.meta.url), 'utf8')
    const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(text)?.[1]
    assert.ok(script, 'dialog script must exist')
    const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const declaration = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .find((item) => ts.isIdentifier(item.name) && item.name.text === factoryName)
    assert.ok(declaration?.initializer, 'dialog default factory must exist')
    const { outputText } = ts.transpileModule(
      'const factory = ' + declaration.initializer.getText(source) + '; factory',
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }
    )
    // Execute the production factory in a small isolated context, without mounting or API writes.
    const factory: unknown = runInNewContext(
      outputText,
      {
        dayjs,
        formatWithDayjs,
        getUserInfo: { value: { tenantId: 'own-tenant', hrEmployeeId: 'own-employee' } },
        isPlatformSuper: { value: false }
      },
      { timeout: 1000 }
    )
    assert.equal(typeof factory, 'function')
    if (typeof factory !== 'function') return
    const defaults: unknown = factory()
    assert.ok(defaults && typeof defaults === 'object')
    const model = reactive(Object.assign({ id: 'previous-record' as string | undefined }, defaults))
    const editing = computed(() => Boolean(model.id))
    assert.equal(editing.value, false, 'new records must never inherit the edited row ID')
    model.id = 'another-record'
    Object.assign(model, factory())
    assert.equal(model.id, undefined)
    assert.equal(editing.value, false)
  })
}
