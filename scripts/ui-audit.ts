import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import ts from 'typescript'

interface Finding {
  file: string
  line: number
  rule: string
  excerpt: string
}

const projectRoot = process.cwd()
const sourceRoot = path.join(projectRoot, 'src')
const modulesRoot = path.join(projectRoot, 'modules')
const supportedExtensions = new Set(['.vue', '.scss', '.css', '.ts', '.tsx'])

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectFiles(resolved)
      return supportedExtensions.has(path.extname(entry.name)) ? [resolved] : []
    })
  )

  return nested.flat()
}

async function collectModuleUiFiles(): Promise<string[]> {
  if (!existsSync(modulesRoot)) return []

  const entries = await readdir(modulesRoot, { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const moduleSourceRoot = path.join(modulesRoot, entry.name, 'src')
        try {
          await stat(moduleSourceRoot)
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
          throw error
        }
        return await collectFiles(moduleSourceRoot)
      })
  )

  return nested.flat()
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length
}

function excerptAt(content: string, offset: number): string {
  const start = content.lastIndexOf('\n', offset) + 1
  const end = content.indexOf('\n', offset)
  return content.slice(start, end === -1 ? content.length : end).trim()
}

interface TemplateNode {
  type: number
  tag?: string
  props?: Array<{
    type: number
    name?: string
    arg?: { content?: string }
    exp?: { content?: string }
    value?: { content?: string }
  }>
  children?: TemplateNode[]
  loc?: { start: { offset: number } }
}

function findNestedWholeOverlayLoading(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []
  const offsets: number[] = []
  const bodyChildren = (node: TemplateNode): TemplateNode[] =>
    (node.children ?? []).filter(
      (child) =>
        child.type === 1 &&
        !(
          child.tag === 'template' &&
          child.props?.some(
            (property) =>
              property.name === 'slot' &&
              property.arg?.content &&
              property.arg.content !== 'default'
          )
        )
    )
  const visit = (node: TemplateNode): void => {
    if (node.type === 1 && (node.tag === 'ArtDrawer' || node.tag === 'ArtDialog')) {
      let children = bodyChildren(node)
      while (
        children.length === 1 &&
        ['div', 'main', 'section', 'template'].includes(children[0].tag ?? '')
      ) {
        children = bodyChildren(children[0])
      }
      const state = children.length === 1 ? children[0] : undefined
      if (
        state &&
        ['ArtAsyncState', 'ArtOverlayLoading'].includes(state.tag ?? '') &&
        state.props?.some(
          (property) =>
            (property.type === 6 && property.name === 'loading') ||
            (property.type === 7 &&
              property.name === 'bind' &&
              property.arg?.content === 'loading' &&
              property.exp?.content !== 'false')
        )
      ) {
        offsets.push(state.loc?.start.offset ?? 0)
      }
    }
    node.children?.forEach(visit)
  }
  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function findOverlaySkeletonLoading(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []
  const offsets: number[] = []
  const visit = (node: TemplateNode, insideOverlay = false): void => {
    const inOverlay = insideOverlay || ['ArtDialog', 'ArtDrawer'].includes(node.tag ?? '')
    if (inOverlay && node.type === 1) {
      const skeletonState =
        node.tag === 'ArtAsyncState' &&
        node.props?.some(
          (property) => property.name === 'loading-mode' && property.value?.content === 'skeleton'
        )
      if (
        ['ElSkeleton', 'el-skeleton', 'ElSkeletonItem', 'el-skeleton-item'].includes(
          node.tag ?? ''
        ) ||
        skeletonState
      ) {
        offsets.push(node.loc?.start.offset ?? 0)
      }
    }
    node.children?.forEach((child) => visit(child, inOverlay))
  }
  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function findSelfUnmountingFocusToggles(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []
  const offsets: number[] = []
  const visit = (node: TemplateNode): void => {
    if (node.type === 1 && node.tag === 'BusinessWorkspaceFocusToggle') {
      const condition = node.props?.find((property) => property.name === 'if')?.exp?.content
      const model = node.props?.find((property) => property.name === 'model')?.exp?.content
      if (
        condition &&
        model &&
        condition.replace(/[()!\s]/g, '') === model.replace(/[()\s]/g, '')
      ) {
        offsets.push(node.loc?.start.offset ?? 0)
      }
    }
    node.children?.forEach(visit)
  }
  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function hasStaticClass(node: TemplateNode, className: string): boolean {
  const classAttribute = node.props?.find(
    (property) => property.type === 6 && property.name === 'class'
  )
  return Boolean(classAttribute?.value?.content?.split(/\s+/).some((name) => name === className))
}

function findControlIconMargins(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []
  const controls = new Set([
    'elbutton',
    'eldropdownitem',
    'elsegmented',
    'elradiobutton',
    'elcheckboxbutton',
    'ellink',
    'eltag'
  ])
  const offsets: number[] = []
  const visit = (node: TemplateNode, inControl = false): void => {
    const controlled = inControl || controls.has(node.tag?.toLowerCase().replaceAll('-', '') ?? '')
    if (
      controlled &&
      node.tag === 'ArtSvgIcon' &&
      node.props?.some(
        (property) =>
          property.type === 6 &&
          property.name === 'class' &&
          /(?:^|\s)(?:mr|ml)-\d+(?:\s|$)/.test(property.value?.content ?? '')
      )
    ) {
      offsets.push(node.loc?.start.offset ?? 0)
    }
    node.children?.forEach((child) => visit(child, controlled))
  }
  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function containsSectionHeading(node: TemplateNode): boolean {
  if (node.type === 1) {
    if (node.tag === 'ArtSectionTitle' || /^h[1-6]$/.test(node.tag ?? '')) return true
  }
  return node.children?.some(containsSectionHeading) ?? false
}

function countSectionTitles(node: TemplateNode, isRoot = true): number {
  if (!isRoot && node.type === 1 && hasStaticClass(node, 'art-card-xs')) return 0
  const ownCount = node.type === 1 && node.tag === 'ArtSectionTitle' ? 1 : 0
  return (
    ownCount +
    (node.children?.reduce((sum, child) => sum + countSectionTitles(child, false), 0) ?? 0)
  )
}

function findRawTitledCards(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []

  const offsets: number[] = []
  const visit = (node: TemplateNode): void => {
    if (
      node.type === 1 &&
      node.tag === 'section' &&
      hasStaticClass(node, 'art-card-xs') &&
      (countSectionTitles(node) === 1 ||
        node.children?.some((child) => {
          if (child.type !== 1) return false
          return child.tag === 'header' || /^h[1-6]$/.test(child.tag ?? '')
            ? containsSectionHeading(child)
            : false
        }))
    ) {
      offsets.push(node.loc?.start.offset ?? 0)
    }
    node.children?.forEach(visit)
  }

  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function findMissingEmptyDescriptions(
  file: string,
  content: string
): Array<{ offset: number; rule: string }> {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []

  const findings: Array<{ offset: number; rule: string }> = []
  const visit = (node: TemplateNode): void => {
    if (
      node.type === 1 &&
      (node.tag === 'ArtSectionCard' ||
        node.tag === 'ArtAsyncState' ||
        node.tag === 'ArtEmptyState' ||
        node.tag === 'ArtPageShell')
    ) {
      const propNames = new Set(
        node.props?.map((prop) => (prop.type === 6 ? prop.name : prop.arg?.content)) ?? []
      )
      const hasDescription = propNames.has('empty-description') || propNames.has('emptyDescription')
      if (node.tag === 'ArtEmptyState') {
        if (!propNames.has('description')) {
          findings.push({
            offset: node.loc?.start.offset ?? 0,
            rule: 'content/empty-state-needs-next-step'
          })
        }
      } else if (propNames.has('empty') && !hasDescription) {
        findings.push({
          offset: node.loc?.start.offset ?? 0,
          rule:
            node.tag === 'ArtSectionCard'
              ? 'content/section-empty-needs-next-step'
              : 'content/empty-state-needs-next-step'
        })
      }
    }
    node.children?.forEach(visit)
  }

  visit(descriptor.template.ast as TemplateNode)
  return findings
}

function findDirectBusinessFormTables(file: string, content: string): number[] {
  const { descriptor } = parseSfc(content, { filename: file })
  if (!descriptor.template?.ast) return []

  const offsets: number[] = []
  const visit = (node: TemplateNode): void => {
    if (node.type === 1 && /^(?:ElForm|el-form|ElTable|el-table)$/.test(node.tag ?? '')) {
      offsets.push(node.loc?.start.offset ?? 0)
    }
    node.children?.forEach(visit)
  }

  visit(descriptor.template.ast as TemplateNode)
  return offsets
}

function scanFile(file: string, content: string, tooltipOnly = false): Finding[] {
  const findings: Finding[] = []
  const relativeFile = path.relative(projectRoot, file).replaceAll('\\', '/')

  const addFinding = (offset: number, rule: string): void => {
    findings.push({
      file: relativeFile,
      line: lineAt(content, offset),
      rule,
      excerpt: excerptAt(content, offset)
    })
  }

  if (
    path.extname(file) === '.vue' &&
    (relativeFile.startsWith('src/views/') || /^modules\/[^/]+\/src\/views\//.test(relativeFile))
  ) {
    findDirectBusinessFormTables(file, content).forEach((offset) => {
      addFinding(offset, 'architecture/use-art-form-or-table')
    })
  }

  if (relativeFile.startsWith('modules/art-supabase-scm/src/')) {
    for (const match of content.matchAll(/\bElTable(?:Column)?\b|<\/?el-table(?:-column)?\b/g)) {
      if (match.index != null) addFinding(match.index, 'consistency/scm-use-art-table')
    }
  }

  if (
    path.extname(file) === '.vue' &&
    relativeFile !== 'src/components/core/feedback/art-tooltip/index.vue'
  ) {
    for (const match of content.matchAll(/<(?:ElTooltip|el-tooltip)\b/g)) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      addFinding(match.index, 'consistency/use-art-tooltip')
    }
  }

  if (path.extname(file) === '.vue') {
    findControlIconMargins(file, content).forEach((offset) => {
      addFinding(offset, 'consistency/use-control-icon-gap')
    })
    findSelfUnmountingFocusToggles(file, content).forEach((offset) => {
      addFinding(offset, 'interaction/focus-toggle-lifecycle')
    })
    findOverlaySkeletonLoading(file, content).forEach((offset) => {
      addFinding(offset, 'feedback/use-overlay-shared-loading')
    })
    findNestedWholeOverlayLoading(file, content).forEach((offset) => {
      addFinding(offset, 'feedback/whole-overlay-loading-owner')
    })
    findMissingEmptyDescriptions(file, content).forEach(({ offset, rule }) => {
      addFinding(offset, rule)
    })

    for (const match of content.matchAll(/\bv-loading(?::[\w-]+)?(?:\s*=|\s|>)/g)) {
      if (match.index == null || excerptAt(content, match.index).includes('data-ui-audit-allow')) {
        continue
      }
      addFinding(match.index, 'consistency/use-art-overlay-loading')
    }
  }

  for (const match of content.matchAll(
    /<ArtSvgIcon\b[^>]*\bclass="[^"\r\n]*\b(?:mr|ml)-[^"\r\n]*"[^>]*>/g
  )) {
    if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
    addFinding(match.index, 'consistency/use-icon-label-gap')
  }

  for (const match of content.matchAll(
    /\.(?:art-svg-icon|el-icon)\s*\{[^}]*\bmargin-(?:left|right)\s*:/gs
  )) {
    if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
    addFinding(match.index, 'consistency/use-icon-label-gap')
  }

  for (const match of content.matchAll(
    /(?::deep\()?\.art-(?:section-card|page-section)__header\)?\s*\{[^}]*\bflex-direction\s*:\s*column/gs
  )) {
    if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
    addFinding(match.index, 'layout/use-intrinsic-section-header-wrap')
  }

  for (const match of content.matchAll(
    /(?::deep\()?\.art-(?:section-card|page-section)__actions\)?\s*\{[^}]*\bwidth\s*:\s*100%/gs
  )) {
    if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
    addFinding(match.index, 'layout/use-intrinsic-section-header-actions')
  }

  if (
    path.extname(file) === '.vue' &&
    (relativeFile.startsWith('src/views/') || /^modules\/[^/]+\/src\/views\//.test(relativeFile))
  ) {
    const rawErrorPatterns = [
      /\bString\(\s*(?:error|err)\s*\)/g,
      /\bJSON\.stringify\(\s*(?:error|err)\b[^)]*\)/g,
      /\berror\s+instanceof\s+Error\s*\?\s*error\.message\b/g,
      /\bElMessage\.(?:error|warning|info|success)\s*\(\s*(?:error|err)\.message\b/g
    ]
    rawErrorPatterns.forEach((pattern) => {
      for (const match of content.matchAll(pattern)) {
        if (match.index != null) addFinding(match.index, 'quality/no-raw-error-render')
      }
    })
  }

  if (tooltipOnly) return findings

  const rules = [
    {
      name: 'styles/no-unconditional-body-print-hiding',
      pattern: /:global\(\s*body\s+\*\s*\)\s*\{[^}]*\bvisibility\s*:\s*hidden\b/gs
    },
    {
      name: 'styles/no-parent-suffix-in-deep',
      pattern: /:deep\(\s*&[\w-]+/g
    },
    {
      name: 'motion/no-transition-all',
      pattern: /(?:-webkit-)?transition\s*:\s*all\b|\btransition-all\b/g
    },
    {
      name: 'a11y/no-static-element-click',
      pattern: /<(?:div|span|li|p|i)\b[^>]*@click(?:\.[\w-]+)*\s*=/gs
    }
  ]

  rules.forEach(({ name, pattern }) => {
    for (const match of content.matchAll(pattern)) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      addFinding(match.index, name)
    }
  })

  if (['.vue', '.scss', '.css'].includes(path.extname(file))) {
    for (const match of content.matchAll(/:global\((?:[^()]|\([^)]*\))*\)\s+(?=[.#&[:\w])/g)) {
      if (match.index != null) addFinding(match.index, 'styles/global-selector-must-be-complete')
    }
  }

  if (path.extname(file) === '.vue') {
    for (const match of content.matchAll(/<(?:ElEmpty|el-empty)\b/g)) {
      if (match.index == null || excerptAt(content, match.index).includes('data-ui-audit-allow')) {
        continue
      }
      addFinding(match.index, 'consistency/use-art-empty-state')
    }

    for (const match of content.matchAll(
      /<(?:div|section)\b[^>]*class=["'][^"']*__state[^"']*["'][^>]*>[\s\S]{0,500}?<ElIcon\b[^>]*\bis-loading\b/gs
    )) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      addFinding(match.index, 'consistency/use-art-overlay-loading')
    }

    if (
      ![
        'src/components/business/business-workspace-header/index.vue',
        'src/components/core/surfaces/art-section-card/index.vue'
      ].includes(relativeFile)
    ) {
      findRawTitledCards(file, content).forEach((offset) => {
        if (!excerptAt(content, offset).includes('data-ui-audit-allow')) {
          addFinding(offset, 'consistency/use-art-section-card')
        }
      })
    }

    for (const match of content.matchAll(/<img\b[^>]*>/gs)) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      if (!/\s(?:alt|:alt)\s*=/.test(match[0])) addFinding(match.index, 'images/require-alt')
      const hasWidth = /\s:?width\s*=/.test(match[0])
      const hasHeight = /\s:?height\s*=/.test(match[0])
      if (!hasWidth || !hasHeight) addFinding(match.index, 'images/require-intrinsic-size')
    }

    for (const match of content.matchAll(
      /<(?:ElButton|ArtIconButton)\b[^>]*\scircle(?:\s|=|\/?>)[^>]*>/gs
    )) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      addFinding(match.index, 'consistency/no-circular-icon-actions')
    }

    for (const match of content.matchAll(
      /<ElDropdownItem\b[^>]*\bv-(?:auth|loading|ripple)\b[^>]*>/gs
    )) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      addFinding(match.index, 'runtime/no-directive-on-dropdown-item')
    }

    for (const match of content.matchAll(
      /<BusinessWorkspaceHeader\b[\s\S]*?<\/BusinessWorkspaceHeader>/g
    )) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      const manualRefreshOffset = match[0].search(/ri:refresh-line|>\s*刷新\s*</)
      if (manualRefreshOffset >= 0) {
        addFinding(match.index + manualRefreshOffset, 'consistency/use-workspace-refresh-prop')
      }
    }

    for (const match of content.matchAll(/<ArtStickyActionBar\b[\s\S]*?<\/ArtStickyActionBar>/g)) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      const hasSummary = /<template\s+#summary\b/.test(match[0])
      const hasHint = /\s:?hint\s*=/.test(match[0])
      if (!hasSummary && !hasHint) {
        addFinding(match.index, 'consistency/sticky-action-bar-requires-summary')
      }
    }

    for (const match of content.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gs)) {
      if (match.index == null || match[0].includes('data-ui-audit-allow')) continue
      if (!/rel\s*=\s*["'][^"']*noopener[^"']*["']/.test(match[0])) {
        addFinding(match.index, 'security/external-link-noopener')
      }
    }

    const uploadButtonPatterns = [
      /<ElUpload\b[\s\S]*?<ElButton\b[\s\S]*?<\/ElUpload>/g,
      /h\(\s*ElUpload[\s\S]{0,2000}?h\(\s*ElButton/g
    ]
    uploadButtonPatterns.forEach((pattern) => {
      for (const match of content.matchAll(pattern)) {
        if (match.index != null) addFinding(match.index, 'a11y/no-nested-upload-button')
      }
    })

    if (relativeFile.startsWith('src/views/')) {
      for (const match of content.matchAll(/<(?:ElDialog|el-dialog|ElDrawer|el-drawer)\b/g)) {
        if (match.index != null) addFinding(match.index, 'architecture/use-art-overlay')
      }

      for (const match of content.matchAll(/console\.(?:log|debug)\s*\(/g)) {
        if (match.index != null) addFinding(match.index, 'quality/no-view-debug-log')
      }
    }
  }

  if (relativeFile.startsWith('src/views/')) {
    for (const match of content.matchAll(/\bElMessageBox\.(?:confirm|prompt)\s*\(/g)) {
      if (match.index != null) addFinding(match.index, 'architecture/use-art-feedback')
    }
  }

  return findings
}

const files = await collectFiles(sourceRoot)
const moduleUiFiles = await collectModuleUiFiles()
const componentNames = new Map<string, Finding>()
function checkComponentFileName(file: string): Finding[] {
  if (!file.endsWith('.vue')) return []
  const relativeFile = path.relative(projectRoot, file).replace(/\\/g, '/')
  // Framework roots retain App.vue; nested business components follow kebab-case.
  if (/^(?:src|modules\/[^/]+\/src)\/App\.vue$/.test(relativeFile)) return []
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*\.vue$/.test(path.basename(file))) return []
  return [
    {
      file: relativeFile,
      line: 1,
      rule: 'naming/kebab-case-vue-file',
      excerpt: path.basename(file)
    }
  ]
}
function checkComponentScript(file: string, content: string): Finding[] {
  if (!file.endsWith('.vue')) return []
  const { descriptor } = parseSfc(content, { filename: file })
  const script = descriptor.scriptSetup
  if (!script) return []
  const source = ts.createSourceFile(
    file,
    script.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const scriptFindings: Finding[] = []
  const overlayRefs = new Set<string>()
  const collectOverlayRefs = (node: TemplateNode): void => {
    if (node.type === 1 && ['ArtDialog', 'ArtDrawer'].includes(node.tag ?? '')) {
      const binding = node.props?.find(
        (property) =>
          property.name === 'ref' || (property.name === 'bind' && property.arg?.content === 'ref')
      )
      const name = binding?.value?.content ?? binding?.exp?.content
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) overlayRefs.add(name)
    }
    node.children?.forEach(collectOverlayRefs)
  }
  if (descriptor.template?.ast) collectOverlayRefs(descriptor.template.ast as TemplateNode)
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'value') {
      const state = node.expression
      if (
        ts.isPropertyAccessExpression(state) &&
        ['visible', 'loading', 'confirmLoading', 'fullscreen'].includes(state.name.text) &&
        ts.isPropertyAccessExpression(state.expression) &&
        state.expression.name.text === 'value' &&
        ts.isIdentifier(state.expression.expression) &&
        overlayRefs.has(state.expression.expression.text)
      ) {
        const offset = script.loc.start.offset + node.getStart(source)
        scriptFindings.push({
          file: path.relative(projectRoot, file).replace(/\\/g, '/'),
          line: lineAt(content, offset),
          rule: 'quality/no-double-unref-overlay-state',
          excerpt: excerptAt(content, offset)
        })
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineOptions'
    ) {
      const options = node.arguments[0]
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const property of options.properties) {
          if (
            !ts.isPropertyAssignment(property) ||
            !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
            property.name.text !== 'name' ||
            !(
              ts.isStringLiteral(property.initializer) ||
              ts.isNoSubstitutionTemplateLiteral(property.initializer)
            )
          )
            continue
          const name = property.initializer.text
          const offset = script.loc.start.offset + property.getStart(source)
          const finding: Finding = {
            file: path.relative(projectRoot, file).replace(/\\/g, '/'),
            line: lineAt(content, offset),
            rule: 'naming/unique-component-name',
            excerpt: name
          }
          const previous = componentNames.get(name)
          if (!/^[A-Z][A-Za-z0-9]*$/.test(name))
            scriptFindings.push({ ...finding, rule: 'naming/pascal-case-component-name' })
          if (previous)
            scriptFindings.push({
              ...finding,
              excerpt: `${name} also declared at ${previous.file}:${previous.line}`
            })
          else componentNames.set(name, finding)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return scriptFindings
}
const findings = (
  await Promise.all([
    ...files.map(async (file) => {
      const content = await readFile(file, 'utf8')
      return [
        ...checkComponentFileName(file),
        ...scanFile(file, content),
        ...checkComponentScript(file, content)
      ]
    }),
    ...moduleUiFiles.map(async (file) => {
      const content = await readFile(file, 'utf8')
      return [
        ...checkComponentFileName(file),
        ...scanFile(file, content, true),
        ...checkComponentScript(file, content)
      ]
    })
  ])
).flat()

if (findings.length > 0) {
  console.error(`UI audit failed with ${findings.length} finding(s):`)
  findings.forEach((finding) => {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.rule}] ${finding.excerpt || '(multiline tag)'}`
    )
  })
  process.exitCode = 1
} else {
  console.log(
    `UI audit passed (${files.length} source files and ${moduleUiFiles.length} module UI files checked).`
  )
}
