import 'monaco-editor/features/find/register'
import { monaco } from '@/utils/monaco-runtime'

const languageId = 'supabase-operations-log'

export function registerOperationsTerminalLanguage(): typeof monaco {
  if (monaco.languages.getLanguages().some((language) => language.id === languageId)) return monaco

  monaco.languages.register({ id: languageId })
  monaco.languages.setMonarchTokensProvider(languageId, {
    tokenizer: {
      root: [
        [/^\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+UTC/, 'comment'],
        [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 'string'],
        [/\[(?:ERROR|FATAL)\]/, 'invalid'],
        [/\[(?:INFO|WARN|WARNING)\]/, 'keyword'],
        [/\b(?:ERROR|FATAL|FAILED|FAILURE|Exception|ParserError)\b/i, 'invalid'],
        [/\b(?:WARNING|WARN)\b/i, 'keyword'],
        [
          /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|TABLE|SCHEMA|DATABASE|COPY)\b/i,
          'keyword'
        ],
        [/\b(?:pnpm|supabase|pg_dump|pg_restore|docker|powershell|pwsh|psql)\b/i, 'type'],
        [/(?:[A-Za-z]:\\|\.{1,2}[\\/]|\/[\w.-]+\/)[^\s"'<>|]*/, 'string'],
        [/\b\d+(?:\.\d+)?\b/, 'number']
      ]
    }
  })
  return monaco
}

export const operationsTerminalLanguageId = languageId
