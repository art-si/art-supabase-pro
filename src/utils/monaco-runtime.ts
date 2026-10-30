import * as monaco from 'monaco-editor/editor/editor.api'
import { loader } from '@guolao/vue-monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import 'monaco-editor/language/json/monaco.contribution'
import 'monaco-editor/features/tokenization/register'
import 'monaco-editor/features/hover/register'
// Monaco 0.57's suggest feature entry only registers inline completions.
// Load the controller explicitly so typing and Ctrl+Space open the suggestion widget.
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/comment/browser/comment'

loader.config({ monaco })

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === 'json' ? new jsonWorker() : new editorWorker()
  }
}

export { monaco }
