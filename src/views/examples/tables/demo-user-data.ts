import avatar1 from '@/assets/images/avatar/avatar1.webp'
import avatar2 from '@/assets/images/avatar/avatar2.webp'
import avatar3 from '@/assets/images/avatar/avatar3.webp'
import avatar4 from '@/assets/images/avatar/avatar4.webp'
import avatar5 from '@/assets/images/avatar/avatar5.webp'
import avatar6 from '@/assets/images/avatar/avatar6.webp'
import avatar7 from '@/assets/images/avatar/avatar7.webp'
import avatar8 from '@/assets/images/avatar/avatar8.webp'
import avatar9 from '@/assets/images/avatar/avatar9.webp'
import avatar10 from '@/assets/images/avatar/avatar10.webp'

export interface DemoUser {
  id: string
  userName: string
  userEmail: string
  userPhone: string
  userGender: string
  department: string
  status: string
  score: number
  avatar: string
  createTime: string
}

export interface DemoUserQuery {
  current?: number
  size?: number
  name?: string
  phone?: string
  status?: string
  department?: string
  startTime?: string | null
  endTime?: string | null
}

const avatars = [
  avatar1,
  avatar2,
  avatar3,
  avatar4,
  avatar5,
  avatar6,
  avatar7,
  avatar8,
  avatar9,
  avatar10
]
const departments = ['技术部', '产品部', '运营部', '市场部', '设计部']

export const demoUsers: DemoUser[] = Array.from({ length: 60 }, (_, index) => {
  const number = index + 1
  const label = String(number).padStart(2, '0')
  return {
    id: `demo-${label}`,
    userName: `示例用户${label}`,
    userEmail: `demo${label}@example.com`,
    userPhone: `1380000${String(number).padStart(4, '0')}`,
    userGender: index % 2 === 0 ? '男' : '女',
    department: departments[index % departments.length],
    status: String((index % 4) + 1),
    score: (index % 5) + 1,
    avatar: avatars[index % avatars.length],
    createTime: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`
  }
})

export const queryDemoUsers = (query: DemoUserQuery): { data: DemoUser[]; total: number } => {
  const name = query.name?.trim().toLocaleLowerCase()
  const phone = query.phone?.trim()
  const rows = demoUsers.filter(
    (user) =>
      (!name || user.userName.toLocaleLowerCase().includes(name)) &&
      (!phone || user.userPhone.includes(phone)) &&
      (!query.status || user.status === query.status) &&
      (!query.department || user.department === query.department) &&
      (!query.startTime || user.createTime >= query.startTime) &&
      (!query.endTime || user.createTime <= query.endTime)
  )
  const current = Math.max(1, query.current ?? 1)
  const size = Math.max(1, query.size ?? 20)
  return {
    data: rows.slice((current - 1) * size, current * size),
    total: rows.length
  }
}
