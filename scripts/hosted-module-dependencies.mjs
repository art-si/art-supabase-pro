/**
 * Business modules are independent repositories with their own lockfiles. The platform host loads
 * any locally available module source directly, so these shared dependencies must resolve from the
 * host root. Keeping the policy in one module prevents duplicated Vue contexts, Pinia stores,
 * Element Plus injection state and transport clients in the integrated application.
 */
export const hostedModuleSharedDependencies = [
  '@element-plus/icons-vue',
  '@iconify/vue',
  '@supabase/supabase-js',
  '@vueuse/core',
  'dayjs',
  'dompurify',
  'element-plus',
  'lodash-es',
  'pinia',
  'qrcode.vue',
  'vue',
  'vue-i18n',
  'vue-router'
]

export const hostedApplicationSourceDirectories = {
  '@fms': 'modules/art-supabase-fms/src',
  '@hr': 'modules/art-supabase-hr/src',
  '@mdm': 'modules/art-supabase-mdm/src',
  '@mes': 'modules/art-supabase-mes/src',
  '@pmis': 'modules/art-supabase-pmis/src',
  '@scm': 'modules/art-supabase-scm/src',
  '@smis': 'modules/art-supabase-smis/src',
  '@tms': 'modules/art-supabase-tms/src',
  '@vms': 'modules/art-supabase-vms/src',
  '@wms': 'modules/art-supabase-wms/src'
}
