import { computed, reactive, ref, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchProjectCatalog } from '@/api/supabase-ai-assistant'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
import type {
  ProjectDatabaseObject,
  ProjectEdgeFunctionResult,
  ProjectObjectDetail,
  ProjectObjectType,
  ProjectOverview,
  ProjectRelationship
} from '@/types/supabase-ai-assistant'

export type ProjectObjectLoadSource = 'initial' | 'filter' | 'refresh'

export interface ProjectCatalogFilters {
  schema: string
  objectType: ProjectObjectType
  keyword: string
}

interface ProjectCatalogLoadingState {
  overview: boolean
  objects: boolean
  detail: boolean
  relationships: boolean
}

interface ProjectCatalogErrorState {
  overview: Error | null
  objects: Error | null
  detail: Error | null
  relationships: Error | null
}

export function useProjectAssistantCatalog() {
  const overview = shallowRef<ProjectOverview | null>(null)
  const schemas = ref<string[]>(['public'])
  const objects = shallowRef<ProjectDatabaseObject[]>([])
  const detail = shallowRef<ProjectObjectDetail | null>(null)
  const relationships = shallowRef<ProjectRelationship[]>([])
  const edgeFunctions = shallowRef<ProjectEdgeFunctionResult | null>(null)
  const selectedObject = shallowRef<ProjectDatabaseObject | null>(null)
  const objectLoadSource = ref<ProjectObjectLoadSource | null>(null)
  const initialSettled = ref(false)
  const filters = reactive<ProjectCatalogFilters>({
    schema: 'public',
    objectType: 'table',
    keyword: ''
  })
  const loading = reactive<ProjectCatalogLoadingState>({
    overview: false,
    objects: false,
    detail: false,
    relationships: false
  })
  const errors = reactive<ProjectCatalogErrorState>({
    overview: null,
    objects: null,
    detail: null,
    relationships: null
  })
  let activeObjectRequest = 0
  let activeDetailRequest = 0

  const initialLoading = computed(
    () => !initialSettled.value && (loading.overview || loading.objects)
  )
  const pageError = computed(() => {
    if (!initialSettled.value || overview.value || objects.value.length) return null
    return errors.overview || errors.objects
  })

  async function loadOverview(): Promise<void> {
    loading.overview = true
    errors.overview = null
    try {
      const [overviewResult, schemaResult, edgeResult] = await Promise.all([
        fetchProjectCatalog({ catalogAction: 'overview' }),
        fetchProjectCatalog({ catalogAction: 'schemas' }),
        fetchProjectCatalog({ catalogAction: 'edge_functions' })
      ])
      overview.value = overviewResult
      schemas.value = schemaResult
      edgeFunctions.value = edgeResult
    } catch (error) {
      errors.overview = error instanceof Error ? error : new Error('项目概览加载失败')
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '项目概览加载失败'))
    } finally {
      loading.overview = false
    }
  }

  async function loadObjects(source: ProjectObjectLoadSource = 'filter'): Promise<void> {
    const requestId = ++activeObjectRequest
    objectLoadSource.value = source
    loading.objects = true
    errors.objects = null
    try {
      const result = await fetchProjectCatalog({
        catalogAction: 'list_objects',
        args: { ...filters, limit: 100 }
      })
      if (requestId !== activeObjectRequest) return
      objects.value = result
    } catch (error) {
      if (requestId !== activeObjectRequest) return
      errors.objects = error instanceof Error ? error : new Error('数据库对象加载失败')
    } finally {
      if (requestId === activeObjectRequest) {
        loading.objects = false
        objectLoadSource.value = null
      }
    }
  }

  async function selectObject(item: ProjectDatabaseObject): Promise<void> {
    const requestId = ++activeDetailRequest
    selectedObject.value = item
    detail.value = null
    relationships.value = []
    loading.detail = true
    loading.relationships = item.objectType === 'table'
    errors.detail = null
    errors.relationships = null

    try {
      const [detailResult, relationResult] = await Promise.all([
        fetchProjectCatalog({
          catalogAction: 'object_detail',
          args: { objectType: item.objectType, schema: item.schemaName, name: item.objectName }
        }),
        item.objectType === 'table'
          ? fetchProjectCatalog({
              catalogAction: 'relationships',
              args: { schema: item.schemaName, name: item.objectName }
            })
          : Promise.resolve([])
      ])
      if (requestId !== activeDetailRequest) return
      detail.value = detailResult
      relationships.value = relationResult
    } catch (error) {
      if (requestId !== activeDetailRequest) return
      errors.detail = error instanceof Error ? error : new Error('对象详情加载失败')
      if (item.objectType === 'table') errors.relationships = errors.detail
    } finally {
      if (requestId === activeDetailRequest) {
        loading.detail = false
        loading.relationships = false
      }
    }
  }

  async function loadInitialData(): Promise<void> {
    initialSettled.value = false
    await Promise.all([loadOverview(), loadObjects('initial')])
    initialSettled.value = true
  }

  return {
    detail,
    edgeFunctions,
    errors,
    filters,
    initialLoading,
    loadInitialData,
    loadObjects,
    loading,
    objectLoadSource,
    objects,
    overview,
    pageError,
    relationships,
    schemas,
    selectedObject,
    selectObject
  }
}
