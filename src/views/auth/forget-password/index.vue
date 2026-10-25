<template>
  <div class="auth-page auth-recovery-page">
    <LoginLeftView />

    <div class="auth-page__panel">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <div class="form__eyebrow">
            <span><ArtSvgIcon icon="ri:mail-send-line" /></span>
            {{ $t('forgetPassword.eyebrow') }}
          </div>
          <h3 class="title">{{ $t('forgetPassword.title') }}</h3>
          <p class="sub-title">{{ $t('forgetPassword.subTitle') }}</p>
          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            form-class="mt-7.5"
            ref="formRef"
            v-model="form"
            :rules="rules"
          >
            <ElFormItem prop="email">
              <ElInput
                class="custom-height"
                :placeholder="$t('forgetPassword.placeholder')"
                v-model.trim="form.email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                :aria-label="$t('forgetPassword.placeholder')"
                :spellcheck="false"
                @keyup.enter="handleSubmit"
              >
                <template #prefix><ArtSvgIcon icon="ri:mail-line" /></template>
              </ElInput>
            </ElFormItem>

            <ElButton
              class="mt-5 w-full custom-height"
              type="primary"
              @click="handleSubmit"
              :loading="loading"
              v-ripple
            >
              <span>{{ $t('forgetPassword.submitBtnText') }}</span>
              <ArtSvgIcon icon="ri:arrow-right-line" />
            </ElButton>

            <RouterLink
              class="auth-page__support-link mt-5 text-sm text-theme"
              :to="{ name: 'Login' }"
            >
              <ArtSvgIcon icon="ri:arrow-left-line" />
              {{ $t('forgetPassword.backBtnText') }}
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
  import { forgetPassword } from '@/api/auth'

  defineOptions({ name: 'ForgetPassword' })

  const { t } = useI18n()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = ref({
    email: ''
  })

  const rules = computed<FormRules<{ email: string }>>(() => ({
    email: [
      { required: true, message: t('register.placeholder.email'), trigger: 'change' },
      {
        type: 'email',
        message: t('register.rule.emailIncorrect'),
        trigger: 'change'
      }
    ]
  }))
  const loading = ref(false)

  const handleSubmit = async () => {
    if (loading.value || !(await formRef.value?.validate()?.catch(() => false))) return
    try {
      loading.value = true
      const params: Api.Auth.ForgetPwdParams = {
        email: form.value.email,
        redirectTo:
          location.origin + location.pathname + '#/auth/reset-password?auth_action=recovery'
      }
      const { error } = await forgetPassword(params)
      if (!error) {
        ElMessage.success('如果邮箱已注册，重置链接将发送至该邮箱，请查收')
      }
    } finally {
      loading.value = false
    }
  }
</script>
