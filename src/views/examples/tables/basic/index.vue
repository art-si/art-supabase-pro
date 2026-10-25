<!-- 基础表格 -->
<template>
  <div class="user-page art-full-height">
    <ElCard class="art-table-card" style="margin-top: 0">
      <!-- 表格 -->
      <ArtTable
        rowKey="id"
        :show-table-header="false"
        :loading="loading"
        :data="data"
        :columns="columns"
        :pagination="pagination"
        @pagination:size-change="handleSizeChange"
        @pagination:current-change="handleCurrentChange"
      >
      </ArtTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { useTable } from '@/hooks/core/useTable'
  import { queryDemoUsers, type DemoUser, type DemoUserQuery } from '../demo-user-data'

  defineOptions({ name: 'TablesBasic' })

  const loadDemoUsers = (params: DemoUserQuery) => Promise.resolve(queryDemoUsers(params))

  const { data, columns, loading, pagination, handleSizeChange, handleCurrentChange } = useTable<
    DemoUser,
    typeof loadDemoUsers
  >({
    core: {
      apiFn: loadDemoUsers,
      apiParams: {
        current: 1,
        size: 20,
        name: '',
        phone: ''
      },
      columnsFactory: () => [
        {
          prop: 'id',
          label: 'ID'
        },
        {
          prop: 'userName',
          label: '示例用户'
        },
        {
          prop: 'userGender',
          label: '性别',
          sortable: true,
          formatter: (row) => row.userGender || '未知'
        },
        {
          prop: 'userPhone',
          label: '手机号'
        },
        {
          prop: 'userEmail',
          label: '邮箱'
        }
      ]
    }
  })
</script>
