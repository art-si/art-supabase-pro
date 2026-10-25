<!-- 注册页面 -->
<template>
  <div class="auth-page auth-register-page">
    <LoginLeftView />

    <div class="auth-page__panel">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <div class="form__eyebrow">
            <span><ArtSvgIcon icon="ri:user-add-line" /></span>
            {{ $t('register.eyebrow') }}
          </div>
          <h3 class="title">{{ $t('register.title') }}</h3>
          <p class="sub-title">{{ $t('register.subTitle') }}</p>
          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            form-class="mt-7.5"
            ref="formRef"
            :model-value="formData"
            @update:model-value="replaceReactiveModel(formData, $event)"
            :rules="rules"
            label-position="top"
            :key="formKey"
          >
            <ElFormItem prop="email">
              <ElInput
                class="custom-height"
                v-model.trim="formData.email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                :aria-label="$t('register.placeholder.email')"
                :spellcheck="false"
                :placeholder="$t('register.placeholder.email')"
              >
                <template #prefix><ArtSvgIcon icon="ri:mail-line" /></template>
              </ElInput>
            </ElFormItem>

            <ElFormItem prop="password">
              <ElInput
                class="custom-height"
                v-model.trim="formData.password"
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
                v-model.trim="formData.confirmPassword"
                name="confirmPassword"
                :placeholder="$t('register.placeholder.confirmPassword')"
                type="password"
                autocomplete="new-password"
                :aria-label="$t('register.placeholder.confirmPassword')"
                @keyup.enter="handleRegister"
                show-password
              >
                <template #prefix><ArtSvgIcon icon="ri:shield-keyhole-line" /></template>
              </ElInput>
            </ElFormItem>

            <ElFormItem prop="agreement" class="agreement-form-item">
              <ElCheckbox v-model="formData.agreement">
                {{ $t('register.agreeText') }}
                <RouterLink class="text-theme agreement-link" to="/privacy-policy">{{
                  $t('register.privacyPolicy')
                }}</RouterLink>
              </ElCheckbox>
            </ElFormItem>

            <div style="margin-top: 15px">
              <ElButton
                class="w-full custom-height"
                type="primary"
                @click="handleRegister"
                :loading="loading"
                v-ripple
              >
                <span>{{ $t('register.submitBtnText') }}</span>
                <ArtSvgIcon icon="ri:arrow-right-line" />
              </ElButton>
            </div>

            <div class="mt-5 text-sm text-g-600">
              <span>{{ $t('register.hasAccount') }}</span>
              <RouterLink class="text-theme" :to="{ name: 'Login' }">{{
                $t('register.toLogin')
              }}</RouterLink>
            </div>
          </ArtForm>

          <div class="form__trust">
            <span class="art-icon-label">
              <ArtSvgIcon icon="ri:lock-line" />
              {{ $t('register.trust.tls') }}
            </span>
            <i />
            <span>{{ $t('register.trust.isolation') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import { useI18n } from 'vue-i18n'
  import type { FormItemRule, FormRules } from 'element-plus'
  import type { QueryResult } from '@/types/api/response'
  import { register } from '@/api/auth'
  import { useSystemParam } from '@/hooks/core/system-param'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'

  defineOptions({ name: 'Register' })

  type RegisterParams = Api.Auth.RegisterParams

  interface RegisterForm {
    email: string
    password: string
    confirmPassword: string
    agreement: boolean
  }

  const REDIRECT_DELAY = 1000

  const { t, locale } = useI18n()
  const router = useRouter()
  const {
    passwordMinLength,
    loadPasswordPolicy,
    getPasswordMinLengthMessage,
    getPasswordComplexityMessage,
    validatePasswordComplexity
  } = useSystemParam()
  const { websiteConfig, loadWebsiteConfig } = useWebsiteConfig()

  const formRef = ref<InstanceType<typeof ArtForm>>()

  const loading = ref(false)
  const formKey = ref(0)

  // 监听语言切换，重置表单
  watch(locale, () => {
    formKey.value++
  })

  onMounted(() => {
    void loadWebsiteConfig().then(() => {
      if (!websiteConfig.value.registerEnabled) {
        ElMessage.warning('当前站点未开放注册')
        router.replace({ name: 'Login' })
      }
    })
    void loadPasswordPolicy().then(() => {
      if (formData.password) {
        void formRef.value?.validateField('password')
      }
    })
  })

  const formData = reactive<RegisterForm>({
    email: '',
    password: '',
    confirmPassword: '',
    agreement: false
  })

  /**
   * 验证密码
   * 当密码输入后，如果确认密码已填写，则触发确认密码的验证
   */
  const validatePassword: FormItemRule['validator'] = (_rule, value, callback) => {
    const password = String(value ?? '')

    if (!password) {
      callback(new Error(t('register.placeholder.password')))
      return
    }

    if (formData.confirmPassword) {
      formRef.value?.validateField('confirmPassword')
    }

    if (!validatePasswordComplexity(password)) {
      callback(new Error(getPasswordComplexityMessage(t)))
      return
    }

    callback()
  }

  /**
   * 验证确认密码
   * 检查确认密码是否与密码一致
   */
  const validateConfirmPassword: FormItemRule['validator'] = (_rule, value, callback) => {
    const confirmPassword = String(value ?? '')

    if (!confirmPassword) {
      callback(new Error(t('register.rule.confirmPasswordRequired')))
      return
    }

    if (confirmPassword !== formData.password) {
      callback(new Error(t('register.rule.passwordMismatch')))
      return
    }

    callback()
  }

  /**
   * 验证用户协议
   * 确保用户已勾选同意协议
   */
  const validateAgreement: FormItemRule['validator'] = (_rule, value, callback) => {
    if (!value) {
      callback(new Error(t('register.rule.agreementRequired')))
      return
    }
    callback()
  }

  const rules = computed<FormRules<RegisterForm>>(() => ({
    password: [
      { required: true, validator: validatePassword, trigger: 'change' },
      {
        min: passwordMinLength.value,
        message: getPasswordMinLengthMessage(t),
        trigger: 'change'
      }
    ],
    email: [
      { required: true, message: t('register.placeholder.email'), trigger: 'change' },
      { type: 'email', trigger: 'change', message: t('register.rule.emailIncorrect') }
    ],
    confirmPassword: [{ required: true, validator: validateConfirmPassword, trigger: 'change' }],
    agreement: [{ validator: validateAgreement, trigger: 'change' }]
  }))

  /**
   * 注册用户
   * 验证表单后提交注册请求
   */
  const handleRegister = async () => {
    if (!formRef.value) return
    if (!websiteConfig.value.registerEnabled) {
      ElMessage.warning('当前站点未开放注册')
      router.replace({ name: 'Login' })
      return
    }

    const valid = await formRef.value.validate()?.catch(() => false)
    if (!valid) return

    loading.value = true
    try {
      const params: RegisterParams = {
        email: formData.email,
        password: formData.password
      }
      const { data } = (await registerAndLink(params)) as QueryResult<unknown>
      if (data) {
        toLogin()
      }
    } finally {
      loading.value = false
    }
  }

  const registerAndLink = async (payload: RegisterParams): Promise<QueryResult<unknown>> => {
    return register(payload)
  }

  /**
   * 跳转到登录页面
   */
  const toLogin = () => {
    setTimeout(() => {
      router.push({ name: 'Login' })
    }, REDIRECT_DELAY)
  }
</script>

<style lang="scss" scoped>
  .auth-register-page {
    .agreement-form-item {
      margin-top: 2px;
      margin-bottom: 0;

      :deep(.el-checkbox) {
        min-height: 32px;
        white-space: normal;
      }

      :deep(.el-checkbox__label) {
        line-height: 22px;
        color: var(--el-text-color-regular);
      }
    }

    .agreement-link {
      text-decoration: none;
    }
  }
</style>
