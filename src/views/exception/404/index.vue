<template>
  <ArtException
    :data="{
      title: '404',
      heading: $t('exceptionPage.404Title'),
      statusLabel: $t('exceptionPage.pageNotFound'),
      desc: $t('exceptionPage.404'),
      hint: $t('exceptionPage.404Hint'),
      btnText: $t('exceptionPage.gohome'),
      secondaryBtnText: $t('exceptionPage.goBack'),
      supportText: $t('exceptionPage.support'),
      visualLabel: $t('exceptionPage.systemStatus'),
      icon: 'ri:compass-3-line',
      primaryIcon: 'ri:home-5-line',
      secondaryIcon: 'ri:arrow-left-line',
      tone: 'info',
      imgUrl
    }"
  />
</template>

<script setup lang="ts">
  import imgUrl from '@imgs/svg/404.svg'
  defineOptions({ name: 'Exception404' })
</script>
