<template>
  <div class="h-[440px] min-w-0 w-full">
    <ArtTableQuery
      class="h-full"
      ref="tableRef"
      :key="`${kind}:${customerId}`"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      :table-props="{
        rowKey: 'id',
        emptyText: `暂无${title}`,
        emptyDescription: `点击新增，维护此客户的${title}。`
      }"
    />
    <ArtDialog ref="editorRef" size="lg">
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="12"
        label-width="128px"
        scroll-to-error
      />
    </ArtDialog>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { ElSwitch } from 'element-plus'
  import type { FormRules } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { canViewField, canEditField } from '@/utils/field-permission'
  import { omit } from 'lodash-es'
  import type { ColumnOption } from '@/types'
  import {
    fetchCustomerContactList,
    addCustomerContact,
    editCustomerContact,
    copyCustomerContact,
    deleteCustomerContactBatch,
    fetchCustomerFinanceList,
    addCustomerFinance,
    editCustomerFinance,
    copyCustomerFinance,
    deleteCustomerFinanceBatch,
    type CustomerContact,
    type CustomerFinance,
    type CustomerChildFieldAccessMap
  } from '@/api/customer-children'

  defineOptions({ name: 'CustomerChildRecords' })
  type Contact = CustomerContact
  type Finance = CustomerFinance
  type ChildRecord = Contact | Finance
  type ChildForm = Contact & Finance
  const props = defineProps<{
    kind: 'contact' | 'finance'
    customerId: string
    tenantId?: string
    fieldAccess?: CustomerChildFieldAccessMap
    permissionScope?: 'TmsCustomer' | 'MdmSalesCustomer'
    readonly?: boolean
  }>()
  const emit = defineEmits<{ changed: [] }>()
  const { hasAuth } = useAuth()
  const title = computed(() => (props.kind === 'contact' ? '联系人' : '财务账户'))
  const permissionSets = {
    TmsCustomer: {
      contact: {
        add: 'TmsCustomer:ContactAdd',
        edit: 'TmsCustomer:ContactEdit',
        copy: 'TmsCustomer:ContactCopy',
        delete: 'TmsCustomer:ContactDelete'
      },
      finance: {
        add: 'TmsCustomer:FinanceAdd',
        edit: 'TmsCustomer:FinanceEdit',
        copy: 'TmsCustomer:FinanceCopy',
        delete: 'TmsCustomer:FinanceDelete'
      }
    },
    MdmSalesCustomer: {
      contact: {
        add: 'MdmSalesCustomer:ContactAdd',
        edit: 'MdmSalesCustomer:ContactEdit',
        copy: 'MdmSalesCustomer:ContactCopy',
        delete: 'MdmSalesCustomer:ContactDelete'
      },
      finance: {
        add: 'MdmSalesCustomer:FinanceAdd',
        edit: 'MdmSalesCustomer:FinanceEdit',
        copy: 'MdmSalesCustomer:FinanceCopy',
        delete: 'MdmSalesCustomer:FinanceDelete'
      }
    }
  } as const
  const permissions = computed(
    () => permissionSets[props.permissionScope ?? 'TmsCustomer'][props.kind]
  )
  const tableRef = ref<ArtTableQueryExpose>()
  const editorRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const busy = ref(false)
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard(
    () => (props.kind === 'contact' ? 'mdm_customer_contact' : 'mdm_customer_finance'),
    title
  )
  const initial = (): ChildForm => ({
    customerId: props.customerId,
    tenantId: props.tenantId,
    name: '',
    alias: '',
    position: '',
    department: '',
    mobile: '',
    telephone: '',
    email: '',
    qq: '',
    isDefault: false,
    role: '',
    invoiceTitle: '',
    taxNo: '',
    bankName: '',
    bankAccount: '',
    bankBranch: '',
    isDefaultInvoice: false,
    remark: ''
  })
  const form = ref<ChildForm>(initial())
  const rules = computed<FormRules>(() =>
    props.kind === 'contact'
      ? {
          name: [{ required: true, message: '请输入联系人姓名', trigger: 'blur' }],
          email: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }]
        }
      : { invoiceTitle: [{ required: true, message: '请输入开票名称', trigger: 'blur' }] }
  )
  const input = (key: string, label: string, maxlength = 100): FormItem => ({
    key,
    label,
    type: 'input',
    props: { maxlength, clearable: true, placeholder: `请输入${label}` }
  })
  const formItems = computed<FormItem[]>(() =>
    props.kind === 'contact'
      ? [
          input('name', '姓名', 50),
          input('alias', '别名', 50),
          input('position', '职位', 50),
          input('department', '部门', 50),
          {
            ...input('mobile', '手机号', 30),
            hidden: !canViewField(props.fieldAccess, 'contactPhone'),
            props: { maxlength: 30, disabled: !canEditField(props.fieldAccess, 'contactPhone') }
          },
          {
            ...input('telephone', '固定电话', 30),
            hidden: !canViewField(props.fieldAccess, 'contactPhone'),
            props: { maxlength: 30, disabled: !canEditField(props.fieldAccess, 'contactPhone') }
          },
          input('email', '邮箱'),
          input('qq', 'QQ', 30),
          input('role', '角色', 50),
          {
            key: 'isDefault',
            label: '默认联系人',
            type: 'switch',
            description:
              '开启后自动同步姓名、联系电话等信息到客户主档；同一客户仅保留一位默认联系人。'
          }
        ]
      : [
          {
            ...input('invoiceTitle', '开票名称', 100),
            span: 24,
            description: '可与客户名称不同，按实际开票主体填写。'
          },
          {
            ...input('taxNo', '纳税人识别号', 40),
            hidden: !canViewField(form.value.fieldAccess ?? props.fieldAccess, 'taxNo'),
            props: {
              maxlength: 40,
              disabled: !canEditField(form.value.fieldAccess ?? props.fieldAccess, 'taxNo')
            }
          },
          input('bankName', '开户行', 100),
          {
            ...input('bankAccount', '银行账号', 50),
            hidden: !canViewField(form.value.fieldAccess ?? props.fieldAccess, 'bankAccount'),
            props: {
              maxlength: 50,
              disabled: !canEditField(form.value.fieldAccess ?? props.fieldAccess, 'bankAccount')
            }
          },
          input('bankBranch', '支行', 100),
          {
            key: 'isDefaultInvoice',
            label: '默认开票账户',
            type: 'switch',
            span: 24,
            description: '开单时自动带出此账户；同一客户仅保留一个默认开票账户。'
          },
          {
            key: 'remark',
            label: '备注',
            type: 'input',
            span: 24,
            props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
          }
        ]
  )
  const fetchRows = async () => {
    const result =
      props.kind === 'contact'
        ? await fetchCustomerContactList(props.customerId)
        : await fetchCustomerFinanceList(props.customerId)
    if (result.error) throw result.error
    return { data: result.data ?? [], total: result.data?.length ?? 0 }
  }
  const refresh = async () => {
    await tableRef.value?.refreshUpdate()
    emit('changed')
  }
  const labelOf = (row: ChildRecord) => ('name' in row ? row.name : row.invoiceTitle)
  const save = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        props.readonly ||
        !hasAuth(form.value.id ? permissions.value.edit : permissions.value.add)
      )
        return false
      if (props.kind === 'contact') {
        const excluded: Array<'mobile' | 'telephone'> = canEditField(
          props.fieldAccess,
          'contactPhone'
        )
          ? []
          : ['mobile', 'telephone']
        const payload = omit(form.value, excluded)
        if (form.value.id) await editCustomerContact(payload)
        else await addCustomerContact(payload)
      } else {
        const access = form.value.fieldAccess ?? props.fieldAccess
        const excluded: Array<'taxNo' | 'bankAccount'> = []
        if (!canEditField(access, 'taxNo')) excluded.push('taxNo')
        if (!canEditField(access, 'bankAccount')) excluded.push('bankAccount')
        const payload = omit(form.value, excluded)
        if (form.value.id) await editCustomerFinance(payload)
        else await addCustomerFinance(payload)
      }
      await refresh()
      return true
    } catch (error) {
      notifyFriendlyError(error, `${title.value}保存失败，请检查填写内容后重试`)
      return false
    }
  }
  const open = async (row?: ChildRecord) => {
    form.value = { ...initial(), ...row }
    await editorRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${title.value}`,
      confirmText: '保存',
      onConfirm: save
    })
  }
  const copy = async (row: ChildRecord) => {
    if (!row.id || busy.value || props.readonly || !hasAuth(permissions.value.copy)) return
    busy.value = true
    try {
      if (props.kind === 'contact') await copyCustomerContact(row.id)
      else await copyCustomerFinance(row.id)
      await refresh()
    } catch (error) {
      notifyFriendlyError(error, `${title.value}复制失败，请刷新后重试`)
    } finally {
      busy.value = false
    }
  }
  const remove = async (rows: ChildRecord[]) => {
    await deleteRecords({
      resources: rows.map((row) => ({ id: row.id ?? '', label: labelOf(row) })),
      permission: permissions.value.delete,
      remove: () =>
        props.kind === 'contact'
          ? deleteCustomerContactBatch(rows.map((row) => row.id ?? ''))
          : deleteCustomerFinanceBatch(rows.map((row) => row.id ?? '')),
      onDeleted: refresh
    })
  }
  const setDefault = async (row: ChildRecord, value: boolean) => {
    if (busy.value || props.readonly || !hasAuth(permissions.value.edit)) return
    busy.value = true
    try {
      if ('name' in row)
        await editCustomerContact({
          id: row.id,
          customerId: row.customerId,
          name: row.name,
          isDefault: value
        })
      else
        await editCustomerFinance({
          id: row.id,
          customerId: row.customerId,
          invoiceTitle: row.invoiceTitle,
          isDefaultInvoice: value
        })
      await refresh()
    } catch (error) {
      notifyFriendlyError(error, '默认设置保存失败，请刷新后重试')
    } finally {
      busy.value = false
    }
  }
  const columnsFactory = (): ColumnOption<ChildRecord>[] => [
    { type: 'selection', width: 46 },
    ...(props.kind === 'contact'
      ? [
          ['name', '姓名', 120],
          ['alias', '别名', 100],
          ['position', '职位', 100],
          ['department', '部门', 110],
          ...(canViewField(props.fieldAccess, 'contactPhone')
            ? [
                ['mobile', '手机号', 140],
                ['telephone', '固定电话', 145]
              ]
            : []),
          ['email', '邮箱', 180],
          ['qq', 'QQ', 110],
          ['role', '角色', 110]
        ]
      : [
          ['invoiceTitle', '开票名称', 200],
          ...(canViewField(props.fieldAccess, 'taxNo') ? [['taxNo', '纳税人识别号', 170]] : []),
          ['bankName', '开户行', 160],
          ...(canViewField(props.fieldAccess, 'bankAccount')
            ? [['bankAccount', '银行账号', 180]]
            : []),
          ['bankBranch', '支行', 150],
          ['remark', '备注', 180]
        ]
    ).map(([prop, label, minWidth]) => ({
      prop: String(prop),
      label: String(label),
      minWidth: Number(minWidth),
      showOverflowTooltip: true
    })),
    {
      prop: props.kind === 'contact' ? 'isDefault' : 'isDefaultInvoice',
      label: props.kind === 'contact' ? '默认' : '默认开票账户',
      width: 130,
      fixed: 'right',
      formatter: (row) => (
        <ElSwitch
          modelValue={'name' in row ? row.isDefault : row.isDefaultInvoice}
          disabled={busy.value || props.readonly || !hasAuth(permissions.value.edit)}
          aria-label={`设为默认${title.value}：${labelOf(row)}`}
          onChange={(value) => void setDefault(row, Boolean(value))}
        />
      )
    },
    {
      prop: 'operation',
      label: '操作',
      fixed: 'right',
      width: 132,
      formatter: (row) => (
        <BusinessTableRowActions>
          {!props.readonly && (
            <ArtButtonTable
              type="edit"
              permission={permissions.value.edit}
              onClick={() => void open(row)}
            />
          )}
          {!props.readonly && (
            <ArtButtonTable
              type="edit"
              icon="ri:file-copy-line"
              label="复制"
              permission={permissions.value.copy}
              disabled={busy.value}
              onClick={() => void copy(row)}
            />
          )}
          {!props.readonly && (
            <ArtButtonTable
              type="delete"
              permission={permissions.value.delete}
              onClick={() => void remove([row])}
            />
          )}
        </BusinessTableRowActions>
      )
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    props.readonly
      ? []
      : [
          {
            type: 'add',
            label: `新增${title.value}`,
            permission: permissions.value.add,
            onClick: () => void open()
          },
          {
            key: 'copy',
            label: '复制',
            icon: 'ri:file-copy-line',
            permission: permissions.value.copy,
            selectionRequired: true,
            disabled: ({ selectedCount }) => busy.value || selectedCount !== 1,
            onClick: ({ selectedRows }) => copy((selectedRows as ChildRecord[])[0])
          },
          {
            type: 'delete',
            label: '删除',
            permission: permissions.value.delete,
            confirm: false,
            onClick: ({ selectedRows }) => remove(selectedRows as ChildRecord[])
          }
        ]
  )
</script>
