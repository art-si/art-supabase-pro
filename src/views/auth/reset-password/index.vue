<template>
  <div class="auth-page auth-recovery-page">
    <LoginLeftView />

    <div class="auth-page__panel">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <div class="form__eyebrow">
            <span><ArtSvgIcon icon="ri:shield-keyhole-line" /></span>
            {{ $t('resetPassword.eyebrow') }}
          </div>
          <h3 class="title">{{ $t('resetPassword.title') }}</h3>
          <p class="sub-title">{{ $t('resetPassword.subTitle') }}</p>
          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            form-class="mt-7.5"
            ref="formRef"
            v-model="form"
            :rules="rules"
          >
            <ElFormItem prop="password">
              <ElInput
                class="custom-height"
                v-model.trim="form.password"
                name="password"
                :placeholder="$t('register.placeholder.password')"
                type="password"
                autocomplete="new-password"
                :aria-label="$t('register.placeholder.password')"
                show-password
              >
                <template #prefix><ArtSvgIcon icon="ri:lock-2-line" /></template>
              </ElInput>
            </ElFormItem>

            <ElFormItem prop="confirmPassword">
              <ElInput
                class="custom-height"
                v-model.trim="form.confirmPassword"
                name="confirmPassword"
                :placeholder="$t('register.placeholder.confirmPassword')"
                type="password"
                autocomplete="new-password"
                :aria-label="$t('register.placeholder.confirmPassword')"
                @keyup.enter="handleSubmit"
                show-password
              >
                <template #prefix><ArtSvgIcon icon="ri:shield-keyhole-line" /></template>
              </ElInput>
            </ElFormItem>
            <ElButton
              class="mt-5 w-full custom-height"
              type="primary"
              @click="handleSubmit"
              :loading="loading"
              v-ripple
            >
              <span>{{ $t('resetPassword.submitBtnText') }}</span>
              <ArtSvgIcon icon="ri:arrow-right-line" />
            </ElButton>

            <RouterLink
              class="auth-page__support-link mt-5 text-sm text-theme"
              :to="{ name: 'Login' }"
            >
              <ArtSvgIcon icon="ri:arrow-left-line" />
              {{ $t('resetPassword.backBtnText') }}
            </RouterLink>
          </ArtForm>

          <div class="form__trust">
            <span class="art-icon-label">
              <ArtSvgIcon icon="ri:lock-line" />
              {{ $t('register.trust.tls') }}
            </span>
            <i aria-hidden="true" />
            <span>{{ $t('register.trust.isolation') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormRules } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { resetPassword } from '@/api/auth'
  import { useSystemParam } from '@/hooks/core/system-param'

  defineOptions({ name: 'ResetPassword' })

  const { t } = useI18n()
  const router = useRouter()
  const route = useRoute()
  const {
    passwordMinLength,
    loadPasswordPolicy,
    getPasswordMinLengthMessage,
    getPasswordComplexityMessage,
    validatePasswordComplexity
  } = useSystemParam()

  const loading = ref(false)

  const formRef = ref<InstanceType<typeof ArtForm>>()

  const form = ref({
    password: '',
    confirmPassword: ''
  })

  const rules = computed<FormRules<{ password: string; confirmPassword: string }>>(() => ({
    password: [
      { required: true, validator: validatePassword, trigger: 'change' },
      {
        min: passwordMinLength.value,
        message: getPasswordMinLengthMessage(t),
        trigger: 'change'
      }
    ],
    confirmPassword: [{ required: true, validator: validateConfirmPassword, trigger: 'change' }]
  }))

  onMounted(() => {
    void loadPasswordPolicy().then(() => {
      if (form.value.password) {
        void formRef.value?.validateField('password')
      }
    })
  })

  /**
   * 验证密码
   * 当密码输入后，如果确认密码已填写，则触发确认密码的验证
   */
  const validatePassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
    if (!value) {
      callback(new Error(t('register.placeholder.password')))
      return
    }

    if (form.value.confirmPassword) {
      formRef.value?.validateField('confirmPassword')
    }

    if (!validatePasswordComplexity(value)) {
      callback(new Error(getPasswordComplexityMessage(t)))
      return
    }

    callback()
  }

  /**
   * 验证确认密码
   * 检查确认密码是否与密码一致
   */
  const validateConfirmPassword = (
    _rule: unknown,
    value: string,
    callback: (error?: Error) => void
  ) => {
    if (!value) {
      callback(new Error(t('register.rule.confirmPasswordRequired')))
      return
    }

    if (value !== form.value.password) {
      callback(new Error(t('register.rule.passwordMismatch')))
      return
    }

    callback()
  }

  const handleSubmit = async () => {
    if (loading.value || !(await formRef.value?.validate()?.catch(() => false))) return
    try {
      loading.value = true
      if (route.query.auth_action !== 'recovery') {
        ElMessage.error('无效或已过期的重置链接')
        return
      }
      const params: Api.Auth.ResetPwdParams = {
        password: form.value.password
      }
      const { error } = await resetPassword(params)
      if (!error) {
        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}#/auth/reset-password`
        )
        ElMessage.success('密码重置成功,请前往登录')
        toLogin()
      }
    } finally {
      loading.value = false
    }
  }

  const toLogin = () => {
    router.push({ name: 'Login' })
  }
</script>
