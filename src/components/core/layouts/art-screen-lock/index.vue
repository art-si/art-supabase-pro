<!-- 锁屏 -->
<template>
  <div class="layout-lock-screen">
    <!-- 锁屏弹窗 -->
    <ElDialog
      v-if="!isLock"
      v-model="visible"
      width="440px"
      class="lock-dialog"
      align-center
      :aria-label="$t('lockScreen.lock.title')"
      @opened="handleDialogOpened"
      @closed="handleDialogClosed"
    >
      <template #header>
        <div class="lock-dialog__header">
          <span class="lock-symbol" aria-hidden="true">
            <ElIcon><Lock /></ElIcon>
          </span>
          <div class="lock-dialog__heading">
            <h2>{{ $t('lockScreen.lock.title') }}</h2>
            <p>{{ $t('lockScreen.lock.description') }}</p>
          </div>
        </div>
      </template>

      <div class="lock-identity">
        <img :src="userInfo.avatar || defaultAvatar" width="44" height="44" alt="" />
        <div class="lock-identity__text">
          <span>{{ $t('lockScreen.currentAccount') }}</span>
          <strong :title="displayName">{{ displayName }}</strong>
        </div>
      </div>

      <ArtForm
        ref="formRef"
        :model-value="formData"
        @update:model-value="replaceReactiveModel(formData, $event)"
        custom-layout
        root-class="lock-screen-form"
        :show-reset="false"
        :show-submit="false"
        :rules="rules"
        @submit="handleLock"
      >
        <ElFormItem
          prop="password"
          for="lock-screen-password"
          :label="$t('lockScreen.lock.passwordLabel')"
          class="lock-field"
        >
          <ElInput
            id="lock-screen-password"
            ref="lockInputRef"
            v-model="formData.password"
            class="lock-input"
            type="password"
            name="lock-screen-password"
            autocomplete="new-password"
            show-password
            :placeholder="$t('lockScreen.lock.inputPlaceholder')"
          />
        </ElFormItem>
        <ElButton type="primary" native-type="submit" class="lock-submit" v-ripple>
          {{ $t('lockScreen.lock.btnText') }}
        </ElButton>
        <ElButton text class="lock-secondary" @click="visible = false">
          {{ $t('lockScreen.lock.cancelBtnText') }}
        </ElButton>
      </ArtForm>
    </ElDialog>

    <!-- 解锁界面 -->
    <dialog
      v-else
      ref="unlockDialogRef"
      class="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 p-0"
      aria-labelledby="unlock-title"
      @cancel.prevent
      @keydown.esc.stop.prevent
    >
      <ElScrollbar class="unlock-scrollbar h-full">
        <main class="unlock-content">
          <div class="unlock-content__brand">
            <ArtLogo :size="32" />
            <span>{{ brandName }}</span>
          </div>

          <section class="unlock-panel" aria-labelledby="unlock-title">
            <span class="lock-symbol lock-symbol--large" aria-hidden="true">
              <ElIcon><Lock /></ElIcon>
            </span>
            <h1 id="unlock-title">{{ $t('lockScreen.unlock.title') }}</h1>
            <p class="unlock-panel__description">{{ $t('lockScreen.unlock.description') }}</p>

            <div class="lock-identity">
              <img :src="userInfo.avatar || defaultAvatar" width="44" height="44" alt="" />
              <div class="lock-identity__text">
                <span>{{ $t('lockScreen.currentAccount') }}</span>
                <strong :title="displayName">{{ displayName }}</strong>
              </div>
            </div>

            <ArtForm
              ref="unlockFormRef"
              :model-value="unlockForm"
              @update:model-value="replaceReactiveModel(unlockForm, $event)"
              custom-layout
              root-class="lock-screen-form"
              :show-reset="false"
              :show-submit="false"
              :rules="rules"
              @submit="handleUnlock"
            >
              <ElFormItem
                prop="password"
                for="unlock-screen-password"
                :label="$t('lockScreen.unlock.passwordLabel')"
                class="lock-field"
              >
                <ElInput
                  id="unlock-screen-password"
                  ref="unlockInputRef"
                  v-model="unlockForm.password"
                  class="lock-input"
                  type="password"
                  name="unlock-screen-password"
                  autocomplete="new-password"
                  show-password
                  :placeholder="$t('lockScreen.unlock.inputPlaceholder')"
                  @input="unlockError = ''"
                />
              </ElFormItem>
              <p v-if="unlockError" class="unlock-error" role="alert">{{ unlockError }}</p>
              <ElButton type="primary" native-type="submit" class="lock-submit" v-ripple>
                {{ $t('lockScreen.unlock.btnText') }}
              </ElButton>
              <ElButton text class="lock-secondary" @click="toLogin">
                {{ $t('lockScreen.unlock.backBtnText') }}
              </ElButton>
            </ArtForm>
          </section>
        </main>
      </ElScrollbar>
    </dialog>
  </div>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import { Lock } from '@element-plus/icons-vue'
  import { useEventListener, useScrollLock } from '@vueuse/core'
  import { getCurrentScope } from 'vue'
  import { ElInput, type FormRules } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import CryptoJS from 'crypto-js'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { useUserStore } from '@/store/modules/user'
  import { mittBus } from '@/utils/sys'
  import defaultAvatar from '@imgs/user/avatar.webp'

  const componentScope = getCurrentScope()

  // 国际化
  const { t } = useI18n()

  // 环境变量
  const ENCRYPT_KEY = import.meta.env.VITE_LOCK_ENCRYPT_KEY

  // Store
  const userStore = useUserStore()
  const { info: userInfo, lockPassword, isLock } = storeToRefs(userStore)
  const { brandName } = useWebsiteConfig()
  const displayName = computed(
    () =>
      userInfo.value.nickName ||
      userInfo.value.userName ||
      userInfo.value.email ||
      t('lockScreen.accountFallback')
  )
  const isBodyScrollLocked = useScrollLock(document.body)

  // 响应式数据
  const visible = ref<boolean>(false)
  const lockInputRef = ref<InstanceType<typeof ElInput>>()
  const unlockInputRef = ref<InstanceType<typeof ElInput>>()
  const unlockDialogRef = ref<HTMLDialogElement>()
  const unlockError = ref('')

  // 表单相关
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const unlockFormRef = ref<InstanceType<typeof ArtForm>>()

  const formData = reactive({
    password: ''
  })

  const unlockForm = reactive({
    password: ''
  })

  // 表单验证规则
  const rules = computed<FormRules>(() => ({
    password: [
      {
        required: true,
        message: t('lockScreen.passwordRequired'),
        trigger: 'blur'
      }
    ]
  }))

  // 工具函数
  const verifyPassword = (inputPassword: string, storedPassword: string): boolean => {
    try {
      const decryptedPassword = CryptoJS.AES.decrypt(storedPassword, ENCRYPT_KEY).toString(
        CryptoJS.enc.Utf8
      )
      return inputPassword === decryptedPassword
    } catch (error) {
      console.error('密码解密失败:', error)
      return false
    }
  }

  // 事件处理函数
  const handleKeydown = (event: KeyboardEvent) => {
    if (!isLock.value && event.altKey && event.key.toLowerCase() === '¬') {
      event.preventDefault()
      visible.value = true
    }
  }

  useEventListener(document, 'keydown', handleKeydown)

  const handleDialogOpened = () => {
    lockInputRef.value?.focus()
  }

  const handleDialogClosed = () => {
    formData.password = ''
    formRef.value?.clearValidate()
  }

  const handleLock = async () => {
    if (!formRef.value) return

    await formRef.value.validate((valid) => {
      if (valid && componentScope?.active) {
        const encryptedPassword = CryptoJS.AES.encrypt(formData.password, ENCRYPT_KEY).toString()
        userStore.setLockStatus(true)
        userStore.setLockPassword(encryptedPassword)
        visible.value = false
        formData.password = ''
      }
    })
  }

  const handleUnlock = async () => {
    if (!unlockFormRef.value) return

    await unlockFormRef.value.validate((valid) => {
      if (valid && componentScope?.active) {
        const isValid = verifyPassword(unlockForm.password, lockPassword.value)

        if (isValid) {
          try {
            userStore.setLockStatus(false)
            userStore.setLockPassword('')
            unlockForm.password = ''
            unlockError.value = ''
            visible.value = false
          } catch (error) {
            console.error('更新store失败:', error)
          }
        } else {
          unlockError.value = t('lockScreen.pwdError')
          unlockInputRef.value?.focus()
        }
      }
    })
  }

  const toLogin = () => {
    userStore.logOut()
  }

  const openLockScreen = () => {
    if (!isLock.value) visible.value = true
  }

  // 在实际输入框挂载后恢复焦点，初次进入和再次锁屏使用同一流程。
  watch(
    [isLock, unlockDialogRef, unlockInputRef],
    ([locked, dialog, input]) => {
      isBodyScrollLocked.value = locked
      if (locked) {
        // Native modal layers isolate existing and late-mounted business portals.
        if (dialog && !dialog.open) dialog.showModal()
        input?.focus()
      } else unlockError.value = ''
    },
    { immediate: true, flush: 'post' }
  )

  // Close before Vue removes the dialog so the browser restores its previous focus.
  watch(
    isLock,
    (locked) => {
      if (!locked) unlockDialogRef.value?.close()
    },
    { flush: 'sync' }
  )

  onBeforeUnmount(() => unlockDialogRef.value?.close())

  onMounted(() => mittBus.on('openLockScreen', openLockScreen))
  onUnmounted(() => {
    mittBus.off('openLockScreen', openLockScreen)
    isBodyScrollLocked.value = false
  })
</script>

<style lang="scss" scoped>
  :global(.el-dialog.lock-dialog) {
    max-width: calc(100vw - 32px);
    border: 1px solid var(--art-modal-surface-border);
    border-radius: var(--art-feature-radius, 18px) !important;
    box-shadow: var(--art-modal-surface-shadow);
  }

  :global(.lock-dialog .el-dialog__header) {
    padding: 30px 30px 0;
    margin: 0;
  }

  :global(.lock-dialog .el-dialog__headerbtn) {
    top: 18px;
    right: 18px;
    width: 36px;
    height: 36px;
  }

  :global(.lock-dialog .el-dialog__body) {
    padding: 24px 30px 28px;
  }

  :global(.lock-screen-form.art-form) {
    padding: 0;
  }

  .lock-dialog__header {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding-right: 28px;
  }

  .lock-dialog__heading {
    min-width: 0;

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 650;
      line-height: 28px;
      color: var(--el-text-color-primary);
    }

    p {
      margin: 5px 0 0;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
    }
  }

  .lock-symbol {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 44px;
    height: 44px;
    font-size: 22px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
    border-radius: var(--art-control-radius, 10px);

    &--large {
      width: 56px;
      height: 56px;
      margin: 0 auto;
      font-size: 26px;
      border-radius: 16px;
    }
  }

  .lock-identity {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    padding: 12px 14px;
    background: var(--art-gray-100);
    border: 1px solid var(--art-card-border);
    border-radius: var(--art-control-radius, 10px);

    img {
      flex: none;
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 50%;
    }
  }

  .lock-identity__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    text-align: left;

    span {
      font-size: 12px;
      line-height: 18px;
      color: var(--el-text-color-secondary);
    }

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      color: var(--el-text-color-primary);
      white-space: nowrap;
    }
  }

  .lock-field {
    margin: 24px 0 20px;
  }

  .lock-field :deep(.el-form-item__label) {
    height: auto;
    padding: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
    color: var(--el-text-color-primary);
  }

  .lock-input {
    width: 100%;
  }

  .lock-input :deep(.el-input__wrapper) {
    min-height: 46px;
    padding: 0 12px;
    border-radius: var(--art-control-radius, 10px);
  }

  .lock-submit {
    width: 100%;
    height: 46px;
    font-weight: 600;
    border-radius: var(--art-control-radius, 10px);
  }

  .lock-secondary {
    display: flex;
    width: 100%;
    height: 40px;
    margin: 10px 0 0 !important;
    color: var(--el-text-color-secondary);
  }

  .lock-secondary:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: 2px;
  }

  .unlock-content {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 80px 20px 32px;
    background: color-mix(in srgb, var(--theme-color) 3%, var(--el-bg-color-page));
  }

  .unlock-content__brand {
    position: absolute;
    top: 28px;
    left: 32px;
    display: inline-flex;
    gap: 10px;
    align-items: center;
    max-width: calc(100% - 64px);
    font-size: 16px;
    font-weight: 700;
    color: var(--el-text-color-primary);

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .unlock-panel {
    width: min(100%, 440px);
    padding: 36px;
    margin: auto;
    text-align: center;
    background: var(--default-box-color);
    border: 1px solid var(--art-modal-surface-border);
    border-radius: var(--art-feature-radius, 18px);
    box-shadow: var(--art-modal-surface-shadow);

    h1 {
      margin: 20px 0 0;
      font-size: 24px;
      font-weight: 650;
      line-height: 32px;
      color: var(--el-text-color-primary);
    }

    .lock-identity {
      margin-top: 28px;
    }
  }

  .unlock-panel__description {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }

  .unlock-error {
    margin: -8px 0 14px;
    font-size: 12px;
    line-height: 18px;
    color: var(--el-color-danger);
    text-align: left;
  }

  @media (width <= 480px) {
    :global(.lock-dialog .el-dialog__header) {
      padding: 24px 22px 0;
    }

    :global(.lock-dialog .el-dialog__body) {
      padding: 22px 22px 24px;
    }

    .unlock-content__brand {
      top: 20px;
      left: 20px;
      max-width: calc(100% - 40px);
    }

    .unlock-panel {
      padding: 30px 24px;
    }
  }
</style>
