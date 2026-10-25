import hljs from 'highlight.js/lib/core'
import sqlLanguage from 'highlight.js/lib/languages/sql'
import type { Directive } from 'vue'

hljs.registerLanguage('sql', sqlLanguage)

export const sqlHighlightDirective: Directive<HTMLElement, string> = {
  mounted(element, binding) {
    highlightSql(element, binding.value)
  },
  updated(element, binding) {
    if (binding.value === binding.oldValue) return
    element.removeAttribute('data-highlighted')
    highlightSql(element, binding.value)
  }
}

function highlightSql(element: HTMLElement, sql: string): void {
  element.textContent = sql
  hljs.highlightElement(element)
}
