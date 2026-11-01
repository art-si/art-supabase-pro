import type { FormItem } from '@/components/core/forms/art-form/index.vue'
export function createAuthChannelFormItems(index: number, disabled = false): FormItem[] {
  return [
    {
      key: `authChannels.${index}.label`,
      label: '显示名称',
      type: 'input',
      props: { maxlength: 40, placeholder: '', modelModifiers: { trim: true }, disabled }
    },
    {
      key: `authChannels.${index}.key`,
      label: '渠道标识',
      type: 'input',
      props: { maxlength: 40, placeholder: '例如 wechat', modelModifiers: { trim: true }, disabled }
    },
    {
      key: `authChannels.${index}.provider`,
      label: 'Supabase Provider',
      type: 'input',
      props: {
        maxlength: 50,
        placeholder: '例如 custom:wechat',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.icon`,
      label: '图标',
      type: 'input',
      props: {
        maxlength: 80,
        placeholder: '例如 ri:wechat-fill',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.scopes`,
      label: '授权范围',
      type: 'input',
      props: {
        maxlength: 200,
        placeholder: '可选，例如 openid profile email',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.queryParamName`,
      label: '身份中台参数名',
      type: 'input',
      props: {
        maxlength: 64,
        placeholder: '例如 connection',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.queryParamValue`,
      label: '身份中台参数值',
      type: 'input',
      props: {
        maxlength: 160,
        placeholder: '例如 wechat',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.description`,
      label: '登录说明',
      type: 'input',
      props: {
        maxlength: 100,
        placeholder: '告诉用户何时选择此登录方式',
        modelModifiers: { trim: true },
        disabled
      }
    },
    {
      key: `authChannels.${index}.enabled`,
      label: '登录页展示',
      type: 'switch',
      props: { disabled }
    },
    {
      key: `authChannels.${index}.allowLinking`,
      label: '允许用户绑定',
      type: 'switch',
      props: { disabled }
    }
  ]
}
