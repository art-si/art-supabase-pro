<!-- 个人中心页面 -->
<template>
  <div class="user-center art-full-height">
    <div class="user-center__layout">
      <aside class="user-center__profile art-card-xs">
        <div class="user-center__profile-hero">
          <div class="user-center__profile-glow" aria-hidden="true"></div>
          <div class="user-center__avatar-wrap">
            <ElAvatar
              :size="88"
              :src="userInfo.avatar || defaultAvatar"
              :alt="`${displayName}的头像`"
            >
              {{ avatarFallback }}
            </ElAvatar>
            <span class="user-center__online-dot" aria-label="当前在线"></span>
          </div>
          <h1>{{ displayName }}</h1>
          <p class="user-center__account-name">@{{ accountName }}</p>
          <div class="user-center__profile-tags">
            <span class="art-icon-label"><ArtSvgIcon icon="ri:shield-check-line" />当前登录</span>
            <span class="art-icon-label"
              ><ArtSvgIcon icon="ri:building-4-line" />{{ tenantName }}</span
            >
          </div>
        </div>

        <section class="user-center__completion" aria-label="资料完整度">
          <div class="user-center__completion-head">
            <div>
              <strong>资料完整度</strong>
              <p>{{ profileCompletionHint }}</p>
            </div>
            <span>{{ profileCompletion }}%</span>
          </div>
          <ElProgress
            :percentage="profileCompletion"
            :stroke-width="7"
            :show-text="false"
            :status="profileCompletion === 100 ? 'success' : undefined"
          />
        </section>

        <section class="user-center__account-summary">
          <ArtSectionTitle :show-line="false">账户摘要</ArtSectionTitle>
          <ul>
            <li v-for="item in accountSummary" :key="item.label">
              <span class="user-center__summary-icon" aria-hidden="true">
                <ArtSvgIcon :icon="item.icon" />
              </span>
              <div>
                <small>{{ item.label }}</small>
                <span :class="{ 'is-placeholder': item.placeholder }" :title="item.value">
                  {{ item.value }}
                </span>
              </div>
            </li>
          </ul>
        </section>
      </aside>

      <main class="user-center__settings art-card-xs">
        <header class="user-center__settings-header">
          <div class="user-center__settings-title">
            <span aria-hidden="true"><ArtSvgIcon icon="ri:user-settings-line" /></span>
            <div>
              <p>ACCOUNT SETTINGS</p>
              <h2>账户设置</h2>
              <small>维护个人资料与登录凭据，让账户信息保持准确和安全。</small>
            </div>
          </div>
          <div class="user-center__security-badge">
            <ArtSvgIcon icon="ri:verified-badge-line" />
            安全可控
          </div>
        </header>

        <ElTabs v-model="activeTab" class="user-center__tabs">
          <ElTabPane name="profile">
            <template #label>
              <span class="user-center__tab-label">
                <ArtSvgIcon icon="ri:id-card-line" />
                个人资料
              </span>
            </template>

            <section class="user-center__pane">
              <div class="user-center__pane-head">
                <div>
                  <ArtSectionTitle :show-line="false">基本信息</ArtSectionTitle>
                  <p>用于账号识别、业务联系和个性化展示。</p>
                </div>
                <div class="user-center__pane-actions">
                  <template v-if="isEdit">
                    <ElButton @click="cancelProfileEdit">取消</ElButton>
                    <ElButton
                      type="primary"
                      :loading="profileLoading"
                      v-ripple
                      @click="saveProfile"
                    >
                      保存资料
                    </ElButton>
                  </template>
                  <ElButton v-else type="primary" plain @click="startProfileEdit">
                    <ArtSvgIcon icon="ri:edit-2-line" />
                    编辑资料
                  </ElButton>
                </div>
              </div>

              <ArtForm
                ref="ruleFormRef"
                v-model="form"
                :items="profileFormItems"
                :rules="rules"
                :disabled="!isEdit"
                label-position="top"
                :show-reset="false"
                :show-submit="false"
                root-class="user-center__form"
              />
            </section>
          </ElTabPane>

          <ElTabPane name="security">
            <template #label>
              <span class="user-center__tab-label">
                <ArtSvgIcon icon="ri:lock-password-line" />
                密码安全
              </span>
            </template>

            <section class="user-center__pane">
              <div class="user-center__pane-head">
                <div>
                  <ArtSectionTitle :show-line="false">修改登录密码</ArtSectionTitle>
                  <p>定期更新密码，并避免与其他网站重复使用。</p>
                </div>
                <div class="user-center__pane-actions">
                  <template v-if="isEditPwd">
                    <ElButton @click="cancelPasswordEdit">取消</ElButton>
                    <ElButton
                      type="primary"
                      :loading="passwordLoading"
                      v-ripple
                      @click="savePassword"
                    >
                      更新密码
                    </ElButton>
                  </template>
                  <ElButton v-else type="primary" plain @click="startPasswordEdit">
                    <ArtSvgIcon icon="ri:key-2-line" />
                    修改密码
                  </ElButton>
                </div>
              </div>

              <div class="user-center__security-notice">
                <span aria-hidden="true"><ArtSvgIcon icon="ri:shield-keyhole-line" /></span>
                <div>
                  <strong>当前密码策略</strong>
                  <p>至少 {{ passwordMinLength }} 位；{{ passwordComplexityHint }}</p>
                </div>
              </div>

              <ArtForm
                ref="pwdFormRef"
                v-model="pwdForm"
                :items="passwordFormItems"
                :rules="pwdRules"
                :disabled="!isEditPwd"
                label-position="top"
                :show-reset="false"
                :show-submit="false"
                :span="24"
                root-class="user-center__form user-center__password-form"
              />
            </section>
          </ElTabPane>

          <ElTabPane name="login-methods">
            <template #label>
              <span class="user-center__tab-label">
                <ArtSvgIcon icon="ri:login-box-line" />
                登录方式
              </span>
            </template>

            <LoginMethods />
          </ElTabPane>
        </ElTabs>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { updateCurrentUserPassword, updateCurrentUserProfile } from '@/api/auth'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import LoginMethods from './modules/login-methods.vue'
  import { useSystemParam } from '@/hooks/core/system-param'
  import { useUserStore } from '@/store/modules/user'
  import defaultAvatar from '@imgs/user/avatar.webp'
  import type { FormItemRule, FormRules } from 'element-plus'

  defineOptions({ name: 'UserCenter' })

  interface FormExpose {
    validate: () => Promise<boolean>
    validateField: (prop: string) => Promise<boolean>
    clearValidate: () => void
  }

  interface ProfileFormModel {
    userName: string
    nickName: string
    email: string
    mobile: string
    address: string
    sex: string
    des: string
  }

  interface PasswordFormModel {
    password: string
    newPassword: string
    confirmPassword: string
  }

  interface AccountSummaryItem {
    label: string
    value: string
    icon: string
    placeholder?: boolean
  }

  const userStore = useUserStore()
  const { getDictMap, getUserInfo: userInfo } = storeToRefs(userStore)
  const {
    passwordMinLength,
    loadPasswordPolicy,
    getPasswordMinLengthMessage,
    getPasswordComplexityMessage,
    validatePasswordComplexity
  } = useSystemParam()

  const activeTab = ref<'profile' | 'security' | 'login-methods'>('profile')
  const isEdit = ref(false)
  const isEditPwd = ref(false)
  const profileLoading = ref(false)
  const passwordLoading = ref(false)
  const ruleFormRef = ref<FormExpose>()
  const pwdFormRef = ref<FormExpose>()

  const createProfileForm = (): ProfileFormModel => ({
    userName: userInfo.value.userName ?? '',
    nickName: userInfo.value.nickName ?? '',
    email: userInfo.value.email ?? '',
    mobile: userInfo.value.userPhone ?? '',
    address: typeof userInfo.value.extra?.address === 'string' ? userInfo.value.extra.address : '',
    sex: userInfo.value.userGender ?? '',
    des: userInfo.value.remark ?? ''
  })

  const createPasswordForm = (): PasswordFormModel => ({
    password: '',
    newPassword: '',
    confirmPassword: ''
  })

  const form = ref<ProfileFormModel>(createProfileForm())
  const pwdForm = ref<PasswordFormModel>(createPasswordForm())

  const displayName = computed(
    () => userInfo.value.nickName || userInfo.value.userName || '未命名用户'
  )
  const accountName = computed(() => userInfo.value.userName || 'account')
  const avatarFallback = computed(() => displayName.value.slice(0, 1).toUpperCase() || 'U')
  const tenantName = computed(() => userInfo.value.tenant?.tenantName || '当前组织')
  const roleSummary = computed(
    () => (userInfo.value.roleNames ?? userInfo.value.userRoles ?? []).join('、') || '未分配角色'
  )

  const profileCompletion = computed(() => {
    const fields = [
      userInfo.value.userName,
      userInfo.value.nickName,
      userInfo.value.email,
      userInfo.value.userPhone,
      userInfo.value.userGender,
      userInfo.value.extra?.address,
      userInfo.value.remark
    ]
    const completed = fields.filter((value) => String(value ?? '').trim()).length
    return Math.round((completed / fields.length) * 100)
  })

  const profileCompletionHint = computed(() =>
    profileCompletion.value === 100 ? '账号资料已完善' : '补充资料有助于团队识别'
  )

  const passwordComplexityHint = computed(() => getPasswordComplexityMessage())

  const accountSummary = computed<AccountSummaryItem[]>(() => [
    {
      label: '登录邮箱',
      value: userInfo.value.email || '未绑定邮箱',
      icon: 'ri:mail-line',
      placeholder: !userInfo.value.email
    },
    {
      label: '手机号码',
      value: userInfo.value.userPhone || '未绑定手机',
      icon: 'ri:smartphone-line',
      placeholder: !userInfo.value.userPhone
    },
    {
      label: '所属角色',
      value: roleSummary.value,
      icon: 'ri:user-star-line'
    },
    {
      label: '所属组织',
      value: tenantName.value,
      icon: 'ri:building-line'
    }
  ])

  const profileFormItems = computed<FormItem[]>(() => [
    {
      label: '姓名',
      key: 'userName',
      type: 'input',
      span: 12,
      props: { placeholder: '请输入姓名', maxlength: 50, clearable: true }
    },
    {
      label: '性别',
      key: 'sex',
      type: 'select',
      span: 12,
      props: { placeholder: '请选择性别', options: getDictMap.value.sex ?? [], clearable: true }
    },
    {
      label: '昵称',
      key: 'nickName',
      type: 'input',
      span: 12,
      props: { placeholder: '请输入昵称', maxlength: 50, clearable: true }
    },
    {
      label: '邮箱',
      key: 'email',
      type: 'input',
      span: 12,
      props: { placeholder: '请输入邮箱', clearable: true }
    },
    {
      label: '手机',
      key: 'mobile',
      type: 'input',
      span: 12,
      props: { placeholder: '请输入手机号码', maxlength: 20, clearable: true }
    },
    {
      label: '地址',
      key: 'address',
      type: 'input',
      span: 12,
      props: { placeholder: '请输入联系地址', maxlength: 120, clearable: true }
    },
    {
      label: '个人介绍',
      key: 'des',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 300,
        showWordLimit: true,
        placeholder: '简单介绍你的职责、专长或工作范围'
      }
    }
  ])

  const passwordFormItems = computed<FormItem[]>(() => [
    {
      label: '当前密码',
      key: 'password',
      type: 'input',
      props: {
        type: 'password',
        showPassword: true,
        autocomplete: 'current-password',
        placeholder: '请输入当前密码'
      }
    },
    {
      label: '新密码',
      key: 'newPassword',
      type: 'input',
      props: {
        type: 'password',
        showPassword: true,
        autocomplete: 'new-password',
        placeholder: '请输入符合策略的新密码'
      }
    },
    {
      label: '确认新密码',
      key: 'confirmPassword',
      type: 'input',
      props: {
        type: 'password',
        showPassword: true,
        autocomplete: 'new-password',
        placeholder: '请再次输入新密码'
      }
    }
  ])

  const validateConfirmPassword: FormItemRule['validator'] = (_rule, value, callback) => {
    if (value !== pwdForm.value.newPassword) {
      callback(new Error('两次输入的新密码不一致'))
      return
    }
    callback()
  }

  const validateNewPassword: FormItemRule['validator'] = (_rule, value, callback) => {
    if (value && !validatePasswordComplexity(value)) {
      callback(new Error(getPasswordComplexityMessage()))
      return
    }
    callback()
  }

  const rules: FormRules<ProfileFormModel> = {
    userName: [
      { required: true, message: '请输入姓名', trigger: 'blur' },
      { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
    ],
    nickName: [
      { required: true, message: '请输入昵称', trigger: 'blur' },
      { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
    ],
    email: [
      { required: true, message: '请输入邮箱', trigger: 'blur' },
      { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }
    ],
    mobile: [{ required: true, message: '请输入手机号码', trigger: 'blur' }],
    address: [{ required: true, message: '请输入地址', trigger: 'blur' }],
    sex: [{ required: true, message: '请选择性别', trigger: 'change' }]
  }

  const pwdRules = computed<FormRules<PasswordFormModel>>(() => ({
    password: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
    newPassword: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      {
        min: passwordMinLength.value,
        message: getPasswordMinLengthMessage(),
        trigger: 'blur'
      },
      { validator: validateNewPassword, trigger: 'blur' }
    ],
    confirmPassword: [
      { required: true, message: '请再次输入新密码', trigger: 'blur' },
      { validator: validateConfirmPassword, trigger: 'blur' }
    ]
  }))

  const startProfileEdit = (): void => {
    form.value = createProfileForm()
    isEdit.value = true
  }

  const cancelProfileEdit = (): void => {
    form.value = createProfileForm()
    ruleFormRef.value?.clearValidate()
    isEdit.value = false
  }

  const startPasswordEdit = (): void => {
    pwdForm.value = createPasswordForm()
    isEditPwd.value = true
  }

  const cancelPasswordEdit = (): void => {
    pwdForm.value = createPasswordForm()
    pwdFormRef.value?.clearValidate()
    isEditPwd.value = false
  }

  const saveProfile = async (): Promise<void> => {
    try {
      await ruleFormRef.value?.validate()
    } catch {
      return
    }

    const { userId, extra } = unref(userInfo)
    const {
      userName,
      nickName,
      sex: userGender,
      mobile: userPhone,
      email: userEmail,
      des: remark
    } = form.value

    profileLoading.value = true
    try {
      await updateCurrentUserProfile({
        userId,
        userName,
        nickName,
        userGender,
        userPhone,
        userEmail,
        remark,
        extra: {
          ...extra,
          address: form.value.address
        }
      } as Api.Auth.UserInfo)
      await userStore.fetchUserInfo()
      form.value = createProfileForm()
      isEdit.value = false
    } finally {
      profileLoading.value = false
    }
  }

  const savePassword = async (): Promise<void> => {
    try {
      await pwdFormRef.value?.validate()
    } catch {
      return
    }

    passwordLoading.value = true
    try {
      await updateCurrentUserPassword(pwdForm.value.password, pwdForm.value.newPassword)
      cancelPasswordEdit()
    } finally {
      passwordLoading.value = false
    }
  }

  watch(
    userInfo,
    () => {
      if (!isEdit.value) form.value = createProfileForm()
    },
    { deep: true }
  )

  onMounted(() => {
    void loadPasswordPolicy().then(() => {
      if (pwdForm.value.newPassword) {
        void pwdFormRef.value?.validateField('newPassword')
      }
    })
  })
</script>

<style scoped lang="scss">
  .user-center {
    min-width: 0;
    padding: 16px;

    &__layout {
      display: grid;
      grid-template-columns: minmax(288px, 328px) minmax(0, 1fr);
      gap: 16px;
      width: 100%;
      max-width: 1480px;
      margin: 0 auto;
    }

    &__profile {
      align-self: start;
      min-width: 0;
      overflow: hidden;
    }

    &__profile-hero {
      position: relative;
      padding: 36px 24px 26px;
      overflow: hidden;
      text-align: center;
      background:
        linear-gradient(145deg, var(--el-color-primary-light-9), transparent 72%),
        var(--default-box-color);
      border-bottom: 1px solid var(--el-border-color-lighter);

      h1 {
        position: relative;
        margin: 16px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 22px;
        font-weight: 650;
        line-height: 30px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__profile-glow {
      position: absolute;
      top: -96px;
      right: -72px;
      width: 210px;
      height: 210px;
      pointer-events: none;
      background: var(--el-color-primary-light-8);
      border-radius: 50%;
      opacity: 0.5;
      filter: blur(12px);
    }

    &__avatar-wrap {
      position: relative;
      display: inline-flex;
      padding: 4px;
      background: var(--default-box-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 50%;
      box-shadow: 0 10px 28px rgb(31 35 48 / 10%);

      :deep(.el-avatar) {
        font-size: 24px;
        font-weight: 700;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
    }

    &__online-dot {
      position: absolute;
      right: 7px;
      bottom: 7px;
      width: 14px;
      height: 14px;
      background: var(--el-color-success);
      border: 3px solid var(--default-box-color);
      border-radius: 50%;
    }

    &__account-name {
      position: relative;
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    &__profile-tags {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 18px;

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        max-width: 100%;
        padding: 5px 9px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-regular);
        white-space: nowrap;
        background: color-mix(in srgb, var(--default-box-color) 82%, transparent);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 999px;
      }
    }

    &__completion {
      padding: 20px 22px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__completion-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      > span {
        flex: none;
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--el-color-primary);
      }
    }

    &__account-summary {
      padding: 18px 22px 22px;

      ul {
        display: grid;
        gap: 14px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      li {
        display: flex;
        gap: 11px;
        align-items: center;
        min-width: 0;

        > div {
          display: grid;
          gap: 1px;
          min-width: 0;

          small {
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }

          span {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 13px;
            color: var(--el-text-color-primary);
            white-space: nowrap;

            &.is-placeholder {
              color: var(--el-text-color-placeholder);
            }
          }
        }
      }
    }

    &__summary-icon {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      font-size: 16px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--art-control-radius);
    }

    &__settings {
      min-width: 0;
      overflow: hidden;
    }

    &__settings-header {
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 24px 26px;
      background: linear-gradient(110deg, var(--el-color-primary-light-9), transparent 62%);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__settings-title {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 48px;
        place-items: center;
        width: 48px;
        height: 48px;
        font-size: 23px;
        color: var(--el-color-primary);
        background: var(--default-box-color);
        border: 1px solid var(--el-color-primary-light-7);
        border-radius: var(--custom-radius);
        box-shadow: 0 8px 24px color-mix(in srgb, var(--el-color-primary) 13%, transparent);
      }

      > div {
        min-width: 0;
      }

      p,
      h2,
      small {
        margin: 0;
      }

      p {
        font-size: 11px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.12em;
      }

      h2 {
        margin-top: 2px;
        font-size: 22px;
        line-height: 30px;
        color: var(--el-text-color-primary);
      }

      small {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__security-badge {
      display: inline-flex;
      flex: none;
      gap: 6px;
      align-items: center;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--el-color-success-dark-2);
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: 999px;
    }

    &__tabs {
      :deep(.el-tabs__header) {
        padding: 0 26px;
        margin: 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
      }

      :deep(.el-tabs__nav-wrap::after) {
        display: none;
      }

      :deep(.el-tabs__item) {
        height: 52px;
        padding: 0 20px;
        font-weight: 500;
      }
    }

    &__tab-label {
      display: inline-flex;
      gap: 7px;
      align-items: center;
    }

    &__pane {
      padding: 24px 26px 28px;
    }

    &__pane-head {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: 22px;

      :deep(.art-section-title) {
        margin: 0;
      }

      p {
        margin: 3px 0 0 11px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    &__pane-actions {
      display: flex;
      flex: none;
      gap: 8px;
      align-items: center;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__form {
      :deep(.el-form-item) {
        margin-bottom: 20px;
      }

      :deep(.el-form-item__label) {
        padding-bottom: 7px;
        font-weight: 500;
        color: var(--el-text-color-regular);
      }

      :deep(.el-textarea__inner) {
        min-height: 104px !important;
      }
    }

    &__password-form {
      max-width: 620px;
    }

    &__security-notice {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      max-width: 720px;
      padding: 14px 16px;
      margin-bottom: 22px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--custom-radius);

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        font-size: 17px;
        color: var(--el-color-primary);
        background: var(--default-box-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 1100px) {
      padding: 12px;

      &__layout {
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 12px;
      }

      &__settings-header,
      &__pane {
        padding-right: 20px;
        padding-left: 20px;
      }
    }

    @media (width <= 820px) {
      &__layout {
        grid-template-columns: minmax(0, 1fr);
      }

      &__account-summary ul {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (width <= 600px) {
      padding: 8px;

      &__settings-header,
      &__pane-head {
        flex-direction: column;
        align-items: flex-start;
      }

      &__settings-header,
      &__pane {
        padding: 18px 16px 22px;
      }

      &__settings-title {
        align-items: flex-start;

        small {
          white-space: normal;
        }
      }

      &__security-badge {
        margin-left: 62px;
      }

      &__tabs :deep(.el-tabs__header) {
        padding: 0 16px;
      }

      &__pane-actions {
        width: 100%;

        .el-button {
          flex: 1;
        }
      }

      &__account-summary ul {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
