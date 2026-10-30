export interface PreparedSqlInput {
  query: string
  keyword: string
  multipleStatements: boolean
}

// This scanner belongs to the independently deployed Edge Function. It only
// identifies statement boundaries and the leading keyword; PostgreSQL remains
// responsible for parsing and validating the SQL itself.
export function prepareSqlInput(raw: string): PreparedSqlInput {
  const sql = raw.trim()
  let keyword = ''
  let delimiter = -1
  let multipleStatements = false
  let state: 'code' | 'single' | 'double' | 'dollar' | 'line' | 'block' = 'code'
  let dollarTag = ''
  let blockDepth = 0
  let escapeString = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (state === 'line') {
      if (ch === '\n') state = 'code'
      continue
    }
    if (state === 'block') {
      if (ch === '/' && next === '*') { blockDepth++; i++; continue }
      if (ch === '*' && next === '/') { blockDepth--; i++; if (blockDepth === 0) state = 'code'; continue }
      continue
    }
    if (state === 'single') {
      if (ch === '\\' && escapeString) { i++; continue }
      if (ch === "'" && next === "'") { i++; continue }
      if (ch === "'") state = 'code'
      continue
    }
    if (state === 'double') {
      if (ch === '"' && next === '"') { i++; continue }
      if (ch === '"') state = 'code'
      continue
    }
    if (state === 'dollar') {
      if (sql.startsWith(dollarTag, i)) { i += dollarTag.length - 1; state = 'code' }
      continue
    }

    if (ch === '-' && next === '-') { state = 'line'; i++; continue }
    if (ch === '/' && next === '*') { state = 'block'; blockDepth = 1; i++; continue }
    if (/\s/.test(ch)) continue
    if (ch === ';') {
      if (delimiter >= 0) multipleStatements = true
      else delimiter = i
      continue
    }
    if (delimiter >= 0) multipleStatements = true
    if (ch === "'") {
      const before = sql[i - 1] ?? ''
      const preceding = sql[i - 2] ?? ''
      escapeString = /[eE]/.test(before) && !/[A-Za-z0-9_$]/.test(preceding)
      state = 'single'
      continue
    }
    if (ch === '"') { state = 'double'; continue }
    if (ch === '$') {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (tag) { dollarTag = tag; state = 'dollar'; i += tag.length - 1; continue }
    }
    if (!keyword && /[A-Za-z_]/.test(ch)) {
      const match = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      if (match) { keyword = match[0].toUpperCase(); i += match[0].length - 1 }
    }
  }

  return {
    query: (delimiter >= 0 && !multipleStatements ? sql.slice(0, delimiter) : sql).trim(),
    keyword,
    multipleStatements
  }
}
