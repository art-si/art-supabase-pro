import Resources = Api.DataCenter.Resources
import { uploadAttachment } from '@/api/attachments'

const uploadAndRefresh = async (files: File | File[], args: Resources.Args): Promise<void> => {
  try {
    await uploadAttachment(files, {
      targetTenantId: typeof args.targetTenantId === 'string' ? args.targetTenantId : undefined,
      onProgress: args.onProgress
    })
  } finally {
    // 部分文件成功、部分失败时也刷新列表，让已完成的上传立即可见。
    await args.handleGetResourceList?.()
  }
}

const resourceDefaultButtons: Resources.Button[] = [
  {
    name: 'local-image-upload',
    label: '图片上传',
    icon: 'ri-image-add-line',
    upload: uploadAndRefresh,
    uploadConfig: {
      accept: 'image/*',
      limit: 1
    },
    order: 0
  },
  {
    name: 'local-file-upload',
    label: '文件上传',
    icon: 'ri-file-upload-line',
    upload: uploadAndRefresh,
    uploadConfig: {
      accept:
        '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.pdf,.mp4,.avi,.wmv,.mov,.flv,.mkv,.webm,.mp3,.wav,.ogg,.wma,.aac,.flac,.ape',
      limit: 1
    },
    order: 1
  }
]

const useResourceStore = defineStore('resourceStore', () => {
  const resourceButtons = ref<Resources.Button[]>([])

  const getButton = (name: string): Resources.Button | undefined => {
    return resourceButtons.value.find((item) => item.name === name)
  }

  const addButton = (button: Resources.Button): boolean => {
    if (getButton(button.name)) {
      return false
    } else {
      resourceButtons.value.push(button)
      return true
    }
  }

  const removeButton = (name: string) => {
    resourceButtons.value = resourceButtons.value.filter((item) => item.name !== name)
  }

  const getAllButton = () => {
    return resourceButtons.value
  }

  resourceDefaultButtons.forEach((item) => addButton(item))

  return {
    addButton,
    removeButton,
    getButton,
    getAllButton
  }
})

export default useResourceStore
