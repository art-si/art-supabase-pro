export interface AssistantHistoryItem {
  id: string
  title: string
  updateTime?: string
  lastMessage?: { content: string } | null
  lastRun?: { model: string; latencyMs?: number | null } | null
}
