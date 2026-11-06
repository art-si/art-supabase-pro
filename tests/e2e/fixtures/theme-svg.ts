import { createApp, h, nextTick, ref } from 'vue'
import ThemeSvg from '@/components/core/theme/theme-svg/index.vue'

interface PendingSvgRequest {
  url: string
  signal?: AbortSignal | null
  resolve: (response: Response) => void
  reject: (error: Error) => void
  body?: ReadableStreamDefaultController<Uint8Array>
}

export interface ThemeSvgFixture {
  setSource: (value: string) => Promise<void>
  requests: () => Array<{ url: string; aborted: boolean }>
  respond: (index: number, markup: string, status?: number) => void
  deferBody: (index: number) => void
  releaseBody: (index: number, markup: string) => void
  fail: (index: number) => void
  unmount: () => Promise<void>
}

declare global {
  interface Window {
    themeSvgFixture: ThemeSvgFixture
    themeSvgExecuted?: boolean
  }
}

const source = ref('')
const pending: PendingSvgRequest[] = []
const realFetch = window.fetch.bind(window)
window.fetch = (input, options) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!url.startsWith('/quality-svg/')) return realFetch(input, options)
  // Deliberately complete even after abort, proving that late callback guards work.
  return new Promise<Response>((resolve, reject) => {
    pending.push({ url, signal: options?.signal, resolve, reject })
  })
}

const app = createApp({ render: () => h(ThemeSvg, { src: source.value, size: 320 }) })
app.mount('#theme-svg-preview')
window.themeSvgFixture = {
  async setSource(value) {
    source.value = value
    await nextTick()
  },
  requests: () => pending.map(({ url, signal }) => ({ url, aborted: signal?.aborted ?? false })),
  respond(index, markup, status = 200) {
    pending[index].resolve(new Response(markup, { status }))
  },
  deferBody(index) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        pending[index].body = controller
      }
    })
    pending[index].resolve(new Response(stream))
  },
  releaseBody(index, markup) {
    const body = pending[index].body
    if (!body) throw new Error('SVG response body is not pending')
    body.enqueue(new TextEncoder().encode(markup))
    body.close()
  },
  fail(index) {
    pending[index].reject(new TypeError('SVG fixture network failure'))
  },
  async unmount() {
    app.unmount()
    await nextTick()
  }
}
