import { addCollection } from '@iconify/vue'
import { mapValues } from 'lodash-es'
import offlineCollections from '@/assets/icons/collections.generated.json'

// Register once at module load, including when a business module or isolated component starts.
for (const collection of offlineCollections) {
  addCollection({
    ...collection,
    icons: mapValues(collection.icons, (icon) => {
      if (!icon) throw new Error('本地图标数据无效，请重新构建应用')
      return icon
    })
  })
}
