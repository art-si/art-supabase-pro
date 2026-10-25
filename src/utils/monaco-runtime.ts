import * as monaco from 'monaco-editor/editor/editor.api'
import { loader } from '@guolao/vue-monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import 'monaco-editor/language/json/monaco.contribution'

loader.config({ monaco })

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === 'json' ? new jsonWorker() : new editorWorker()
  }
}

export { monaco }
