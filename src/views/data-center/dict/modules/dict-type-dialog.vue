<template>
  <ArtDialog ref="dialogRef" size="md">
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="12"
      :gutter="20"
      label-position="top"
      label-width="auto"
      root-class="dict-maintenance-form dict-type-form"
      :show-reset="false"
      :show-submit="false"
      :validate-on-rule-change="false"
      scroll-to-error
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import { omit } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import {
    addDictType,
    editDictType,
    fetchDictionaryDirectoryTree,
    fetchDictionaryTypeOptions
  } from '@/api/data-center'
  import { useUserStore } from '@/store/modules/user'
  import { uniqueValidator } from '@/utils/form/validator'

  type DictTypeItem = Api.DataCenter.DictTypeItem

  interface ArtFormExpose {
    ref: Ref<FormInstance | undefined>
    validate: () => Promise<boolean | void>
    reloadOptions: (key?: string) => Promise<unknown>
  }

  interface OpenOptions {
    parentId?: string
  }

  interface FormGroup {
    data: DictTypeItem
    editing: boolean
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules>
  }

  const emit = defineEmits<{
    success: []
  }>()

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<DictTypeItem>>()
  const formRef = ref<ArtFormExpose>()

  const createInitialForm = (): DictTypeItem => ({
    id: undefined,
    parentId: undefined,
    cascadeParentTypeId: null,
    nodeType: 'directory',
    name: '',
    code: '',
    status: '1',
    sort: 0,
    remark: ''
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    editing: false,
    items: computed<FormItem[]>((): FormItem[] => [
      {
        label: '节点定义',
        key: 'definitionSection',
        type: 'divider',
        span: 24
      },
      {
        label: '节点类型',
        key: 'nodeType',
        type: 'segment',
        span: 24,
        description: form.editing
          ? '节点类型创建后不可更改。'
          : '根层级仅支持目录；字典类型需选择上级目录。',
        props: {
          disabled: form.editing,
          onChange: (value: DictTypeItem['nodeType']) => {
            formRef.value?.ref.value?.clearValidate('parentId')
            if (value === 'directory') {
              form.data.cascadeParentTypeId = null
              return
            }
            void nextTick(() => formRef.value?.reloadOptions('cascadeParentTypeId'))
          },
          options: [
            { label: '目录', value: 'directory' },
            { label: '字典类型', value: 'dictionary' }
          ]
        }
      },
      {
        label: form.data.nodeType === 'directory' ? '目录名称' : '类型名称',
        key: 'name',
        type: 'input',
        props: {
          maxlength: 100,
          placeholder: form.data.nodeType === 'directory' ? '请输入目录名称' : '请输入字典类型名称'
        }
      },
      {
        label: form.data.nodeType === 'directory' ? '目录编码' : '类型编码',
        key: 'code',
        type: 'input',
        props: {
          maxlength: 100,
          placeholder: form.data.nodeType === 'directory' ? '请输入目录编码' : '请输入字典类型编码'
        }
      },
      {
        label: '层级关系',
        key: 'hierarchySection',
        type: 'divider',
        span: 24
      },
      {
        label: '上级目录',
        key: 'parentId',
        type: 'cascader',
        span: 24,
        api: fetchDictionaryDirectoryTree,
        params: {
          excludeId: form.editing && form.data.nodeType === 'directory' ? form.data.id : undefined
        },
        resultField: 'data',
        labelField: 'name',
        valueField: 'id',
        childrenField: 'children',
        description:
          form.data.nodeType === 'dictionary'
            ? '必选。字典类型必须归属到目录，根层级只展示目录。'
            : '可选。不选择则作为最外层目录。',
        props: {
          clearable: true,
          filterable: true,
          separator: ' / ',
          placeholder:
            form.data.nodeType === 'dictionary' ? '请选择字典类型所属目录' : '请选择上级目录',
          style: { width: '100%' },
          props: {
            checkStrictly: true,
            emitPath: false
          }
        }
      },
      {
        label: '级联上级类型',
        key: 'cascadeParentTypeId',
        type: 'select',
        span: 24,
        hidden: form.data.nodeType !== 'dictionary',
        api: fetchDictionaryTypeOptions,
        immediate: false,
        params: {
          excludeId: form.editing ? form.data.id : undefined
        },
        resultField: 'data',
        labelField: 'name',
        valueField: 'id',
        labelFn: (option) => `${String(option.name ?? '')} · ${String(option.code ?? '')}`,
        description:
          '可选。配置后，本类型的每个字典项都必须归属到所选上级类型的一个字典项；适用于一级、二级等分类级联。',
        props: {
          clearable: true,
          filterable: true,
          placeholder: '请选择级联上级类型'
        }
      },
      {
        label: '展示设置',
        key: 'presentationSection',
        type: 'divider',
        span: 24
      },
      {
        label: '排序',
        key: 'sort',
        type: 'number',
        description: '值越小，显示位置越靠前。',
        props: {
          min: 0,
          step: 1,
          stepStrictly: true,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      {
        label: '状态',
        key: 'status',
        type: 'segment',
        props: {
          options: getDictMap.value?.status ?? []
        }
      },
      {
        label: '补充说明',
        key: 'descriptionSection',
        type: 'divider',
        span: 24
      },
      {
        label: '描述',
        key: 'remark',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          placeholder: '请输入节点的用途或维护说明',
          maxlength: 500,
          showWordLimit: true
        }
      }
    ]),
    rules: computed<FormRules>(() => ({
      nodeType: [{ required: true, message: '请选择节点类型', trigger: 'change' }],
      name: [{ required: true, message: '请输入名称', trigger: 'change' }],
      code: [
        { required: true, message: '请输入编码', trigger: 'change' },
        {
          validator: uniqueValidator({
            table: 'sys_dict_type',
            field: 'code',
            getExcludeId: (): string | undefined => form.data.id,
            message: '编码已存在'
          }),
          trigger: 'change'
        }
      ],
      parentId:
        form.data.nodeType === 'dictionary'
          ? [{ required: true, message: '请选择字典类型所属目录', trigger: 'change' }]
          : []
    }))
  })

  const resetForm = (): void => {
    Object.assign(form.data, createInitialForm())
    formRef.value?.ref.value?.clearValidate()
  }

  const normalizePayload = (data: DictTypeItem): DictTypeItem => ({
    ...data,
    parentId: data.parentId === '' ? null : data.parentId,
    cascadeParentTypeId:
      data.nodeType === 'dictionary' && data.cascadeParentTypeId ? data.cascadeParentTypeId : null
  })

  const handleOpen = async (data?: DictTypeItem, options: OpenOptions = {}): Promise<void> => {
    resetForm()
    form.editing = !!data?.id

    if (data) {
      Object.assign(form.data, structuredClone(omit(data, ['children'])))
    } else {
      form.data.parentId = options.parentId
      form.data.nodeType = options.parentId ? 'dictionary' : 'directory'
    }

    await dialogRef.value?.handleOpen(data, {
      title: form.editing
        ? form.data.nodeType === 'directory'
          ? '编辑字典目录'
          : '编辑字典类型'
        : '新增字典节点',
      subtitle: form.editing
        ? '调整节点归属、级联关系与展示设置'
        : '先定义节点用途，再配置目录归属与级联关系',
      size: 'md',
      confirmText: form.editing ? '保存更改' : '创建节点',
      contentMaxHeight: 'min(72vh, calc(100vh - 200px))',
      onOpen: async () => {
        await Promise.all([
          formRef.value?.reloadOptions('parentId'),
          form.data.nodeType === 'dictionary'
            ? formRef.value?.reloadOptions('cascadeParentTypeId')
            : undefined
        ])
      },
      onConfirm: handleSubmit,
      onReset: resetForm
    })
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = normalizePayload(
        omit(toRaw(form.data), [
          'children',
          'tenantId',
          'createBy',
          'createTime',
          'updateBy',
          'updateTime'
        ]) as DictTypeItem
      )

      if (form.data.id) {
        await editDictType(payload)
      } else {
        await addDictType(payload)
      }
      await userStore.fetchDictList()
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '字典保存失败，请检查名称与层级后重试', 'warning')
      return false
    }
  }

  defineExpose({
    handleOpen
  })
</script>

<style scoped lang="scss">
  @use './dict-maintenance-dialog';
</style>
