import type { DashboardOrder, DashboardReminder } from '@/api/dashboard'

export interface DashboardMetric {
  key: string
  label: string
  value: string
  unit?: string
  hint: string
  icon: string
  tone: 'primary' | 'info' | 'warning' | 'success' | 'danger'
  route: string
}

export interface DashboardStatusItem {
  key: string
  label: string
  value: number
  percent: number
  color: string
}

export interface DashboardTrendData {
  labels: string[]
  values: number[]
  orderCount: number
  freightAmount: number
}

export type { DashboardOrder, DashboardReminder }
