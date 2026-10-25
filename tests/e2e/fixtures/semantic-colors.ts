import { createApp, h } from 'vue'
import { ElAlert, ElButton, ElTag } from 'element-plus'
import './semantic-colors.css'
import '@styles/index.scss'

const types = ['success', 'warning', 'danger', 'info'] as const
const tokenClasses = {
  success: 'semantic-token-text text-success',
  warning: 'semantic-token-text text-warning',
  danger: 'semantic-token-text text-danger',
  info: 'semantic-token-text text-info'
}
createApp({
  render: () =>
    h(
      'main',
      { class: 'grid gap-4 p-4 bg-[var(--el-bg-color)]' },
      types.map((type) =>
        h('section', { class: 'grid gap-3', 'aria-label': type }, [
          h('p', { class: tokenClasses[type] }, `${type} 公共文本颜色`),
          ...(type === 'danger'
            ? [h('p', { class: 'semantic-token-text text-error' }, 'error 公共文本颜色')]
            : []),
          h('div', { class: 'flex flex-wrap gap-3' }, [
            ...(['light', 'plain', 'dark'] as const).map((effect) =>
              h(ElTag, { type, effect }, () => `${type} ${effect}`)
            ),
            h(ElButton, { type }, () => `${type} 操作`),
            h(ElButton, { type, plain: true }, () => `${type} 次要操作`),
            h(ElButton, { type, dashed: true }, () => `${type} 虚线操作`)
          ]),
          ...(['light', 'dark'] as const).map((effect) =>
            h(ElAlert, {
              type: type === 'danger' ? 'error' : type,
              title: `${type} ${effect} 提示`,
              description: '公共状态文字应当清晰可读',
              effect,
              closable: false
            })
          )
        ])
      )
    )
}).mount('#semantic-colors')
