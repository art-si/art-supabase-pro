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
      root-class="dict-maintenance-form dict-entry-form"
      :show-reset="false"
      :show-submit="false"
      :validate-on-rule-change="false"
      scroll-to-error
    >
      <template #dictTypeName>
        <div class="dict-entry-type">
          <el-tag
            class="dict-entry-type__tag"
            effect="light"
            size="large"
            :disable-transitions="true"
            :title="form.data.dictTypeName || '未指定类型'"
          >
            <ArtSvgIcon icon="ri:book-2-line" aria-hidden="true" />
            <span>{{ form.data.dictTypeName || '未指定类型' }}</span>
          </el-tag>
          <span v-if="form.data.dictTypeCode" class="dict-entry-type__code">
            类型编码 · {{ form.data.dictTypeCode }}
          </span>
        </div>
      </template>

      <template #color>
        <div class="dict-color-field">
          <el-color-picker
            v-model="form.data.color"
            :predefine="elementPlusPresetColors"
            aria-label="选择字典文字颜色"
          />
          <span>{{ form.data.color || '默认颜色' }}</span>
        </div>
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import { cloneDeep, isEmpty, omit } from 'lodash-es'
  import { addDict, editDict, fetchDictionaryListByTypeId } from '@/api/data-center'
  import { useUserStore } from '@/store/modules/user'
  import { uniqueValidator } from '@/utils/form/validator'
  import TreeUtils from '@/utils/tree'

  type DictListItem = Api.DataCenter.DictListItem
  type DictFormData = Omit<Partial<DictListItem>, 'tagType'> & {
    dictTypeCode?: string
    dictTypeName: string
    cascadeParentTypeId?: string | null
    cascadeParentTypeName?: string
    tagType?: Api.Common.TagType | ''
  }
  interface ArtFormExpose {
    ref: Ref<FormInstance | undefined>
    validate: () => Promise<boolean | void>
    reloadOptions: (key?: string) => Promise<unknown>
  }

  interface FormGroup {
    data: DictFormData
    items: FormItem[]
    rules: FormRules
  }

  const emits = defineEmits(['success'])

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)

  const dialogRef = ref<ArtDialogExpose<DictListItem>>()
  const formRef = ref<ArtFormExpose>()
  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })

  const dataDefault: DictFormData = {
    typeId: '',
    parentId: undefined,
    cascadeParentId: undefined,
    dictTypeCode: '',
    dictTypeName: '',
    cascadeParentTypeId: null,
    cascadeParentTypeName: '',
    label: '',
    code: '',
    value: '',
    i18nScope: '1',
    status: '1',
    sort: 1,
    color: '',
    tagType: '',
    participatesInventoryAccounting: true,
    remark: ''
  }
  const elementPlusPresetColors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399']
  const hasCascadeParentType = (): boolean => !!form.value.data.cascadeParentTypeId
  const getParentFieldKey = (): 'cascadeParentId' | 'parentId' =>
    hasCascadeParentType() ? 'cascadeParentId' : 'parentId'
  const getParentTypeName = (): string =>
    form.value.data.cascadeParentTypeName || form.value.data.dictTypeName || '字典项'
  const getParentFieldLabel = (): string =>
    hasCascadeParentType() ? `所属${getParentTypeName()}` : '上级字典项'
  const getParentPlaceholder = (): string =>
    hasCascadeParentType() ? `请选择${getParentTypeName()}` : '不选择则为一级字典项'
  const getParentDescription = (): string =>
    hasCascadeParentType()
      ? `必选。选择后，“${form.value.data.dictTypeName}”只会在对应的“${getParentTypeName()}”下显示；若列表为空，请先在“${getParentTypeName()}”中新增可用字典项。`
      : '可选。不选择则创建为一级字典项；选择后将作为所选字典项的下级。'
  const getParentTypeId = (): string => {
    return String(form.value.data.cascadeParentTypeId || form.value.data.typeId || '')
  }
  const form: Ref<FormGroup> = ref({
    data: cloneDeep(dataDefault),
    items: computed(
      (): FormItem[] =>
        [
          {
            label: '归属与层级',
            key: 'ownershipSection',
            type: 'divider',
            span: 24
          },
          {
            label: '所属类型',
            key: 'dictTypeName',
            type: 'text',
            span: 24
          },
          {
            label: getParentFieldLabel(),
            key: getParentFieldKey(),
            type: 'treeSelect',
            span: 24,
            description: getParentDescription(),
            api: fetchDictionaryListByTypeId,
            immediate: false,
            params: {},
            beforeFetch: () => ({
              typeId: getParentTypeId()
            }),
            shouldFetch: (params): boolean => !!params?.typeId,
            afterFetch: ({ data = [] }) => {
              const tree = treeUtils.listToTree(data as DictListItem[]) as DictListItem[]
              const excludedIds = new Set(
                treeUtils
                  .getDescendants(tree, String(form.value.data.id || ''), true)
                  .map((item) => String(item.id))
              )
              const available = (data as DictListItem[]).filter(
                (item) => !item.id || !excludedIds.has(String(item.id))
              )
              return treeUtils.listToTree(
                available,
                (a, b) => Number(a.sort || 0) - Number(b.sort || 0)
              ) as DictListItem[]
            },
            labelField: 'label',
            valueField: 'id',
            childrenField: 'children',
            props: {
              clearable: true,
              checkStrictly: true,
              defaultExpandAll: true,
              renderAfterExpand: false,
              placeholder: getParentPlaceholder(),
              emptyText: `暂无可选的${getParentTypeName()}`,
              props: {
                label: 'label',
                value: 'id',
                children: 'children'
              }
            }
          },
          {
            label: '字典内容',
            key: 'contentSection',
            type: 'divider',
            span: 24
          },
          {
            label: '字典标签',
            key: 'label',
            type: 'input',
            props: {
              placeholder: '请输入字典标签',
              clearable: true
            }
          },
          {
            label: '字典编码',
            key: 'code',
            type: 'input',
            props: {
              placeholder: '请输入字典编码',
              clearable: true
            }
          },
          {
            label: '字典值',
            key: 'value',
            type: 'input',
            props: {
              placeholder: '请输入字典值',
              clearable: true
            }
          },
          {
            label: '国际化',
            key: 'i18n',
            type: 'input',
            props: {
              placeholder: '请输入国际化',
              clearable: true
            }
          },
          {
            label: '展示设置',
            key: 'presentationSection',
            type: 'divider',
            span: 24
          },
          {
            label: '国际化范围',
            key: 'i18nScope',
            type: 'radioGroup',
            props: {
              options: getDictMap.value.i18nScope ?? []
            }
          },
          {
            label: '状态',
            key: 'status',
            type: 'segment',
            props: {
              options: getDictMap.value.status ?? []
            }
          },
          {
            label: '排序',
            key: 'sort',
            type: 'number',
            description: '值越小，显示位置越靠前。',
            props: {
              placeholder: '请输入排序',
              min: 0,
              step: 1,
              stepStrictly: true,
              controlsPosition: 'right',
              style: { width: '100%' }
            }
          },
          {
            label: '文字颜色',
            key: 'color',
            slots: 'color'
          },
          {
            label: '标签样式',
            key: 'tagType',
            type: 'tagStyleSelect',
            props: { clearable: true, placeholder: '请选择标签样式' }
          },
          ...(form.value.data.dictTypeCode === 'wmsInitialStockType'
            ? [
                {
                  label: '参与存货核算',
                  key: 'participatesInventoryAccounting',
                  type: 'switch',
                  description: '此库存类型的业务是否计入存货核算。',
                  span: 24
                }
              ]
            : []),
          {
            label: '补充说明',
            key: 'descriptionSection',
            type: 'divider',
            span: 24
          },
          {
            label: '备注信息',
            key: 'remark',
            type: 'input',
            span: 24,
            props: {
              placeholder: '请输入字典项的用途或补充说明',
              type: 'textarea',
              rows: 3,
              clearable: true
            }
          }
        ] as FormItem[]
    ),
    rules: computed<FormRules>(() => {
      return {
        label: [{ required: true, message: '字典标签不能为空', trigger: 'change' }],
        code: [
          { required: true, message: '字典编码不能为空', trigger: 'change' },
          {
            validator: uniqueValidator({
              table: 'sys_dictionary',
              field: 'code',
              getExcludeId: (): string | undefined => form.value.data?.id,
              extraWhere: (): Record<string, string | number | boolean | null | undefined> => ({
                type_id: form.value.data?.typeId
              }),
              message: '字典编码已存在'
            }),
            trigger: 'change'
          }
        ],
        value: [{ required: true, message: '字典值不能为空', trigger: 'change' }],
        ...(hasCascadeParentType()
          ? {
              cascadeParentId: [
                {
                  required: true,
                  message: getParentPlaceholder(),
                  trigger: 'change'
                }
              ]
            }
          : {})
      }
    })
  })

  const handleResetFields = () => {
    form.value.data = cloneDeep(dataDefault)
    formRef.value?.ref.value?.clearValidate()
  }

  const handleOpen = async (
    data: DictListItem & { dictTypeCode?: string; dictTypeName?: string } = {} as DictListItem
  ): Promise<void> => {
    handleResetFields()
    if (!isEmpty(data)) {
      form.value.data = {
        ...form.value.data,
        ...cloneDeep(data)
      }
    }
    await dialogRef.value?.handleOpen(data, {
      title: isEdit.value ? '编辑字典' : '新增字典',
      subtitle: `维护“${form.value.data.dictTypeName}”的取值、层级与展示方式`,
      size: 'md',
      confirmText: isEdit.value ? '保存更改' : '创建字典项',
      contentMaxHeight: 'min(72vh, calc(100vh - 200px))',
      onOpen: async () => {
        await formRef.value?.reloadOptions(getParentFieldKey())
      },
      onConfirm: handleSubmit,
      onReset: handleResetFields
    })
  }

  const normalizePayload = (data: DictListItem): DictListItem => ({
    ...data,
    parentId: data.parentId === '' ? null : data.parentId,
    cascadeParentId: data.cascadeParentId === '' ? null : data.cascadeParentId
  })

  const handleSubmit = async (): Promise<boolean> => {
    if (!formRef.value) return false

    try {
      await formRef.value.validate()
      const {
        data: { id, ...rest }
      } = form.value
      const params = normalizePayload(
        omit(rest, [
          'dictTypeName',
          'dictTypeCode',
          'cascadeParentTypeId',
          'cascadeParentTypeName',
          'children',
          'tenantId',
          'createBy',
          'createTime',
          'updateBy',
          'updateTime',
          'dictTypeTable'
        ]) as DictListItem
      )
      if (!isEdit.value) {
        await addDict(params as DictListItem)
      } else {
        await editDict({ ...params, id } as DictListItem)
      }
      await useUserStore().fetchDictList()
      emits('success')
      return true
    } catch (error) {
      console.warn('表单验证失败:', error)
      return false
    }
  }

  defineExpose({
    handleOpen
  })

  const isEdit = computed(() => !!form.value.data?.id)
</script>

<style scoped lang="scss">
  @use './dict-maintenance-dialog';

  .dict-entry-type {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2) var(--art-space-3);
    align-items: center;
    min-height: 32px;

    &__tag {
      max-width: 100%;
      padding-inline: var(--art-space-3);
      font-weight: 600;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 22%, var(--art-card-border));

      span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__code {
      font-size: 12px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      letter-spacing: 0.01em;
      overflow-wrap: anywhere;
    }
  }

  .dict-color-field {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    min-height: 36px;
    color: var(--el-text-color-regular);
  }
</style>
