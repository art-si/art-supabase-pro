import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/theme-chalk/index.css'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
import SilverMistNative from './silver-mist-native.vue'

const query = new URLSearchParams(location.search)
const root = document.documentElement
const standard = query.get('appearance') === 'standard'
root.dataset.uiScope = 'workspace'
root.dataset.boxMode = query.get('box') === 'shadow' ? 'shadow-mode' : 'border-mode'
root.classList.toggle('dark', query.get('theme') === 'dark')
root.style.setProperty('--el-color-primary', standard ? '#614ff4' : '#0088ff')
root.style.setProperty('--custom-radius', '0.625rem')
if (!standard) root.dataset.workspaceAppearance = 'silver-mist'

createApp(SilverMistNative).use(ElementPlus, { locale: zhCn }).mount('#app')
