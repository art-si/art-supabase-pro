import hljs from 'highlight.js/lib/core'
import sqlLanguage from 'highlight.js/lib/languages/sql'
import jsonLanguage from 'highlight.js/lib/languages/json'
import type { Directive } from 'vue'

export interface CodeHighlightValue {
  code: string
  language: 'sql' | 'json' | 'plaintext'
}

hljs.registerLanguage('sql', sqlLanguage)
hljs.registerLanguage('json', jsonLanguage)

function highlightCode(element: HTMLElement, value: CodeHighlightValue): void {
  // Always assign source as text; highlighted HTML is generated only by highlight.js.
  element.textContent = value.code
  element.classList.remove('language-sql', 'language-json', 'language-plaintext', 'hljs')
  element.classList.add(`language-${value.language}`)
  element.removeAttribute('data-highlighted')
  if (value.language !== 'plaintext') hljs.highlightElement(element)
}

export const codeHighlightDirective: Directive<HTMLElement, CodeHighlightValue> = {
  mounted(element, binding) {
    highlightCode(element, binding.value)
  },
  updated(element, binding) {
    if (
      binding.value.code === binding.oldValue?.code &&
      binding.value.language === binding.oldValue?.language
    )
      return
    highlightCode(element, binding.value)
  }
}
