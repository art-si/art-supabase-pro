<!-- 面包屑导航 -->
<template>
  <nav
    class="art-breadcrumb max-lg:!hidden"
    :class="`art-breadcrumb--${breadcrumbStyle}`"
    aria-label="breadcrumb"
  >
    <ul class="art-breadcrumb__list">
      <li
        v-for="(item, index) in breadcrumbItems"
        :key="item.path"
        class="art-breadcrumb__item"
        :class="{ 'is-current': isLastItem(index) }"
      >
        <button
          v-if="isClickable(item, index)"
          type="button"
          class="art-breadcrumb__content art-breadcrumb__content--interactive"
          :title="item.title"
          @click="handleBreadcrumbClick(item, index)"
        >
          <ArtSvgIcon
            v-if="showBreadcrumbIcon && item.icon"
            :icon="item.icon"
            class="art-breadcrumb__icon"
            aria-hidden="true"
          />
          <span class="art-breadcrumb__label">{{ formatMenuTitle(item.title) }}</span>
        </button>

        <span v-else class="art-breadcrumb__content" aria-current="page" :title="item.title">
          <ArtSvgIcon
            v-if="showBreadcrumbIcon && item.icon"
            :icon="item.icon"
            class="art-breadcrumb__icon"
            aria-hidden="true"
          />
          <span class="art-breadcrumb__label">{{ formatMenuTitle(item.title) }}</span>
        </span>

        <span
          v-if="!isLastItem(index) && item.title"
          class="art-breadcrumb__separator"
          aria-hidden="true"
        >
          /
        </span>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useRouter, useRoute } from 'vue-router'
  import type { RouteLocationMatched, RouteRecordRaw } from 'vue-router'
  import { useSettingStore } from '@/store/modules/setting'
  import { formatMenuTitle } from '@/utils/router'

  defineOptions({ name: 'ArtBreadcrumb' })

  export interface BreadcrumbItem {
    path: string
    title: string
    icon?: string
    isIframe: boolean
  }

  const route = useRoute()
  const router = useRouter()
  const settingStore = useSettingStore()
  const { breadcrumbStyle, showBreadcrumbIcon } = storeToRefs(settingStore)

  const getMetaString = (value: unknown): string => (typeof value === 'string' ? value : '')

  const createBreadcrumbItem = (matchedRoute: RouteLocationMatched): BreadcrumbItem => {
    const icon = getMetaString(matchedRoute.meta.icon)

    return {
      path: matchedRoute.path,
      title: getMetaString(matchedRoute.meta.title),
      icon: icon || undefined,
      isIframe: matchedRoute.meta.isIframe === true
    }
  }

  const isHomeRoute = (matchedRoute: RouteLocationMatched): boolean => matchedRoute.name === '/'

  const isWrapperContainer = (item: BreadcrumbItem): boolean =>
    item.path === '/outside' && item.isIframe

  const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    const { matched } = route
    const matchedLength = matched.length

    if (!matchedLength || isHomeRoute(matched[0])) {
      return []
    }

    const firstRoute = matched[0]
    const isFirstLevel = firstRoute.meta.isFirstLevel === true
    const currentRoute = matched[matchedLength - 1]

    let items = isFirstLevel
      ? [createBreadcrumbItem(currentRoute)]
      : matched.map(createBreadcrumbItem)

    if (items.length > 1 && isWrapperContainer(items[0])) {
      items = items.slice(1)
    }

    if (
      currentRoute.meta.isIframe === true &&
      (items.length === 1 || items.every(isWrapperContainer))
    ) {
      return [createBreadcrumbItem(currentRoute)]
    }

    return items
  })

  const isLastItem = (index: number): boolean => index === breadcrumbItems.value.length - 1

  const isClickable = (item: BreadcrumbItem, index: number): boolean =>
    item.path !== '/outside' && !isLastItem(index)

  const findFirstValidChild = (targetRoute: RouteRecordRaw): RouteRecordRaw | undefined =>
    targetRoute.children?.find((child) => !child.redirect && !child.meta?.isHide)

  const buildFullPath = (childPath: string): string => `/${childPath}`.replace('//', '/')

  async function handleBreadcrumbClick(item: BreadcrumbItem, index: number): Promise<void> {
    if (isLastItem(index) || item.path === '/outside') {
      return
    }

    try {
      const targetRoute = router.getRoutes().find((matchedRoute) => matchedRoute.path === item.path)

      if (!targetRoute?.children?.length) {
        await router.push(item.path)
        return
      }

      const firstValidChild = findFirstValidChild(targetRoute)
      await router.push(firstValidChild ? buildFullPath(firstValidChild.path) : item.path)
    } catch (error) {
      console.error('导航失败:', error)
    }
  }
</script>

<style scoped lang="scss">
  .art-breadcrumb {
    min-width: 0;
    max-width: min(46vw, 680px);
    margin-left: 10px;
    overflow: hidden;

    &__list {
      display: flex;
      align-items: center;
      min-width: 0;
      height: 100%;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    &__item {
      display: flex;
      flex: 0 1 auto;
      align-items: center;
      min-width: 0;
      height: 28px;

      &.is-current {
        .art-breadcrumb__content {
          font-weight: 600;
          color: var(--art-gray-900);
        }

        .art-breadcrumb__icon {
          color: var(--theme-color);
        }
      }
    }

    &__content {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      font: inherit;
      font-size: 13px;
      line-height: 28px;
      color: var(--art-gray-600);
      white-space: nowrap;
      background: transparent;
      border: 0;
      border-radius: var(--el-border-radius-small);
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease;

      &--interactive {
        cursor: pointer;

        &:hover {
          color: var(--art-gray-800);
          background: color-mix(in srgb, var(--theme-color) 7%, transparent);
        }

        &:focus-visible {
          color: var(--theme-color);
          outline: none;
          box-shadow: var(--art-themed-action-focus-shadow);
        }
      }
    }

    &__icon {
      flex: 0 0 auto;
      margin-right: 5px;
      font-size: 14px;
      color: var(--art-gray-500);
      transition: color var(--art-motion-duration-fast) ease;
    }

    &__label {
      min-width: 0;
      max-width: 184px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__separator {
      flex: 0 0 auto;
      margin: 0 4px;
      font-size: 12px;
      color: var(--art-gray-400);
    }

    &--background {
      padding: 1px 0;
      overflow: hidden;

      .art-breadcrumb__item {
        position: relative;
        height: 28px;
        margin-left: -6px;

        &:first-child {
          margin-left: 0;

          .art-breadcrumb__content::before {
            border-radius: var(--el-border-radius-base) 0 0 var(--el-border-radius-base);
            clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%);
          }
        }

        &:last-child {
          .art-breadcrumb__content {
            padding-right: 12px;

            &::before {
              border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;
              clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%);
            }
          }
        }

        &.is-current {
          z-index: 2;

          .art-breadcrumb__content::before {
            background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
          }
        }
      }

      .art-breadcrumb__content {
        z-index: 0;
        height: 28px;
        padding: 0 16px 0 12px;
        line-height: 28px;
        color: var(--art-gray-600);
        border-radius: 0;
        isolation: isolate;

        &::before {
          position: absolute;
          inset: 0;
          z-index: -1;
          content: '';
          background: color-mix(in srgb, var(--art-gray-100) 82%, var(--default-box-color));
          clip-path: polygon(
            0 0,
            calc(100% - 8px) 0,
            100% 50%,
            calc(100% - 8px) 100%,
            0 100%,
            8px 50%
          );
          transition:
            background-color var(--art-motion-duration-fast) ease,
            box-shadow var(--art-motion-duration-fast) ease;
        }

        &--interactive {
          &:hover {
            color: var(--theme-color);
            background: transparent;

            &::before {
              background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
            }
          }

          &:focus-visible {
            color: var(--theme-color);
            box-shadow: none;

            &::before {
              box-shadow: inset 0 0 0 2px var(--theme-color) !important;
            }
          }
        }
      }

      .art-breadcrumb__separator {
        display: none;
      }
    }
  }
</style>
