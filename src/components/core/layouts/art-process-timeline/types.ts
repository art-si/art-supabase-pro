export type ArtProcessTimelineTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface ArtProcessTimelineItem {
  id: string
  actorName?: string | null
  actorAvatar?: string | null
  actionLabel?: string | null
  actionValue?: string | null
  title?: string | null
  description?: string | null
  time?: string | null
  tone?: ArtProcessTimelineTone
  system?: boolean
}
