import zhMessages from '@/locales/langs/zh.json'

type MessageSchema = typeof zhMessages

declare module 'vue-i18n' {
  // Module augmentation requires an interface declaration.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}
