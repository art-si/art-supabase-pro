import cloudbase from '@cloudbase/js-sdk/app'
import { registerAuth } from '@cloudbase/js-sdk/auth'
import { registerRealtimeJs } from '@cloudbase/js-sdk/realtime-js'
import { registerStorage } from '@cloudbase/js-sdk/storage'

registerAuth(cloudbase)
registerStorage(cloudbase)
registerRealtimeJs(cloudbase)

export default cloudbase
