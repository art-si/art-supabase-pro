import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildMaterialCodePreview } from '../../modules/art-supabase-mdm/src/views/components/material-reference/modules/material-code-preview'

describe('buildMaterialCodePreview', () => {
  it('builds the material-type scheme and pads before the fixed segment', () => {
    assert.deepEqual(
      buildMaterialCodePreview({
        fixedField: '',
        segments: [{ source: 'material_type' }, { source: 'fixed', value: '-' }],
        sequenceDigits: 4,
        codeLength: 8,
        materialTypePrefix: 'R'
      }),
      { code: 'R00-0001', overflow: 0, padding: 2 }
    )
    assert.equal(
      buildMaterialCodePreview({
        fixedField: '',
        segments: [{ source: 'material_type' }, { source: 'fixed', value: '-' }],
        sequenceDigits: 4,
        codeLength: 8,
        materialTypePrefix: 'C'
      }).code,
      'C00-0001'
    )
  })

  it('builds the material-category scheme from its configured prefix', () => {
    assert.deepEqual(
      buildMaterialCodePreview({
        fixedField: '',
        segments: [{ source: 'material_category' }, { source: 'fixed', value: '-' }],
        sequenceDigits: 4,
        codeLength: 10,
        materialCategoryPrefix: 'R101'
      }),
      { code: 'R1010-0001', overflow: 0, padding: 1 }
    )
    assert.equal(
      buildMaterialCodePreview({
        fixedField: '',
        segments: [{ source: 'material_category' }, { source: 'fixed', value: '-' }],
        sequenceDigits: 4,
        codeLength: 10,
        materialCategoryPrefix: 'C03'
      }).code,
      'C0300-0001'
    )
  })

  it('reports overflow instead of truncating the generated code', () => {
    assert.deepEqual(
      buildMaterialCodePreview({
        fixedField: '-',
        segments: [{ source: 'material_category' }],
        sequenceDigits: 4,
        codeLength: 5,
        materialCategoryPrefix: 'LONG'
      }),
      { code: 'LONG-0001', overflow: 4, padding: 0 }
    )
  })
})
