import { applyEdits, createScanner, format, SyntaxKind } from 'jsonc-parser'

/** Formatting and whitespace comparison preserve numeric tokens instead of parsing to doubles. */
export function formatSqlJsonText(text: string): string {
  return applyEdits(text, format(text, undefined, { insertSpaces: true, tabSize: 2, eol: '\n' }))
}

export function sqlJsonTokens(text: string): string {
  const scanner = createScanner(text, true)
  const tokens: string[] = []
  while (scanner.scan() !== SyntaxKind.EOF)
    tokens.push(
      text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength())
    )
  return tokens.join('')
}
