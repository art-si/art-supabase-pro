import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

interface TemplateNode {
  type: number
  tag?: string
  props?: Array<{
    name: string
    arg?: { content?: string }
    exp?: { content?: string }
  }>
  children?: TemplateNode[]
  loc: { start: { offset: number } }
}

export interface FormSchemaFinding {
  offset: number
  rule: string
  control?: string
}

const presetTags = new Set(
  [
    'ElInput',
    'ElInputNumber',
    'ElAutocomplete',
    'ElInputTag',
    'ElSelect',
    'ElSelectV2',
    'ElRadio',
    'ElRadioGroup',
    'ElCheckbox',
    'ElCheckboxGroup',
    'ElSwitch',
    'ElDatePicker',
    'ElTimePicker',
    'ElTimeSelect',
    'ElCascader',
    'ElTreeSelect',
    'ElSlider',
    'ElRate',
    'ElColorPicker',
    'ElSegmented',
    'ArtIconPicker',
    'ArtTagStyleSelect',
    'ArtDataSelect',
    'ArtTableSingleSelect',
    'ArtTableMultipleSelect',
    'ArtTreeSingleSelect',
    'ArtTreeMultipleSelect',
    'ArtUserSelect',
    'ArtEmployeeSelect',
    'ArtUploadFile',
    'ArtUploadImage'
  ].map((tag) => tag.replace(/-/g, '').toLowerCase())
)
const normalize = (tag?: string) => tag?.replace(/-/g, '').toLowerCase()
const layoutTags = new Set(['div', 'span', 'template', 'elrow', 'elcol'])
const descriptionTags = new Set([
  'p',
  'small',
  'strong',
  'code',
  'i',
  'b',
  'em',
  'br',
  'artsvgicon',
  'eltag'
])

/** Only unwrap a single field with passive decoration; stop at composite editors and actions. */
function findWrappedPreset(slot: TemplateNode): TemplateNode | undefined {
  const slotName = slot.props?.find((prop) => prop.name === 'slot')?.arg?.content ?? ''
  if (['layout', 'footer', 'default'].includes(slotName) || slotName.endsWith('Actions')) return
  const controls: TemplateNode[] = []
  let composite = false
  const collect = (node: TemplateNode): void => {
    if (node.type !== 1) return
    if (node.props?.some((prop) => prop.name === 'for')) composite = true
    const tag = normalize(node.tag) ?? ''
    if (presetTags.has(tag)) controls.push(node)
    else if (layoutTags.has(tag)) {
      if (node.props?.some((prop) => prop.name === 'on')) composite = true
      node.children?.forEach(collect)
    } else if (!descriptionTags.has(tag) || node.props?.some((prop) => prop.name === 'on')) {
      composite = true
    }
  }
  slot.children?.forEach(collect)
  return !composite && controls.length === 1 ? controls[0] : undefined
}

export function shouldAuditFormSchema(relativeFile: string): boolean {
  return (
    relativeFile.endsWith('.vue') &&
    !/(?:^|\/)src\/components\/core\//.test(relativeFile) &&
    !relativeFile.startsWith('src/views/auth/')
  )
}

/** Audit schema ownership, while allowing genuinely composite editors in named slots. */
export function findNonSchemaFormFields(file: string, content: string): FormSchemaFinding[] {
  const { descriptor } = parse(content, { filename: file })
  if (!descriptor.template?.ast) return []
  const findings: FormSchemaFinding[] = []
  const visit = (node: TemplateNode, inForm = false): void => {
    const tag = normalize(node.tag)
    if (tag === 'elformitem' || tag === 'elform')
      findings.push({ offset: node.loc.start.offset, rule: 'architecture/use-form-schema' })
    const isForm = tag === 'artform'
    if (
      isForm &&
      node.props?.some(
        (prop) =>
          prop.name === 'custom-layout' ||
          prop.name === 'customLayout' ||
          (prop.name === 'bind' &&
            ['custom-layout', 'customLayout'].includes(prop.arg?.content ?? '') &&
            prop.exp?.content !== 'false')
      )
    )
      findings.push({ offset: node.loc.start.offset, rule: 'architecture/use-form-schema-layout' })
    if (inForm && tag === 'template' && node.props?.some((prop) => prop.name === 'slot')) {
      const roots = node.children?.filter((child) => child.type === 1) ?? []
      for (const root of roots) {
        if (presetTags.has(normalize(root.tag) ?? ''))
          findings.push({
            offset: root.loc.start.offset,
            rule: 'architecture/use-form-preset',
            control: root.tag
          })
      }
      const wrapped = findWrappedPreset(node)
      if (wrapped && !roots.includes(wrapped))
        findings.push({
          offset: wrapped.loc.start.offset,
          rule: 'architecture/use-form-preset',
          control: wrapped.tag
        })
    }
    node.children?.forEach((child) => visit(child, isForm))
  }
  visit(descriptor.template.ast as TemplateNode)
  const script = descriptor.scriptSetup
  if (script) {
    const source = ts.createSourceFile(
      file,
      script.content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    )
    const visitScript = (node: ts.Node): void => {
      if (
        ts.isObjectLiteralExpression(node) &&
        node.properties.some(
          (property) => ts.isPropertyAssignment(property) && property.name.getText(source) === 'key'
        )
      ) {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) || property.name.getText(source) !== 'render')
            continue
          const render = property.initializer
          const control = ts.isIdentifier(render)
            ? render
            : ts.isArrowFunction(render) &&
                ts.isCallExpression(render.body) &&
                render.body.expression.getText(source) === 'h' &&
                render.body.arguments.length > 0 &&
                ts.isIdentifier(render.body.arguments[0])
              ? render.body.arguments[0]
              : undefined
          if (control && presetTags.has(normalize(control.text) ?? ''))
            findings.push({
              offset: script.loc.start.offset + property.getStart(source),
              rule: 'architecture/use-form-preset',
              control: control.text
            })
        }
      }
      ts.forEachChild(node, visitScript)
    }
    visitScript(source)
  }
  return findings
}
