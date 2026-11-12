declare namespace Api {
  namespace Notes {
    interface Author {
      authUserId: string
      userName?: string | null
      nickName?: string | null
      tenantName?: string | null
      avatar?: string | null
    }

    interface NoteItem {
      id: string
      userId: string
      content: string
      contentText: string
      images: string[]
      imageUrls: string[]
      tags: string[]
      createdAt: string
      updatedAt: string
      author?: Author | null
    }

    interface NoteSearchParams extends Partial<Api.Common.CommonSearchParams> {
      keyword?: string
      dateRange?: [string, string] | null
    }

    interface NoteListParams extends NoteSearchParams {
      from?: number
      to?: number
    }

    interface NotePayload {
      id?: string
      content: string
      tags: string[]
      images?: string[]
    }

    interface NoteStats {
      total: number
      users: number
      recent: number
      withImages: number
      lastCreatedAt?: string
    }
  }
}
