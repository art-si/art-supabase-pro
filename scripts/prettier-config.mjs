import { readFileSync } from 'node:fs'

export default JSON.parse(readFileSync(new URL('../.prettierrc', import.meta.url), 'utf8'))
