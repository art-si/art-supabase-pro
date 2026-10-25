interface ArtAmapBrowserNamespace {
  plugin?: (pluginNames: string | string[], callback: () => void) => void
  [key: string]: unknown
}

interface Window {
  AMap?: ArtAmapBrowserNamespace
  _AMapSecurityConfig?: {
    securityJsCode?: string
  }
}

interface ImportMetaEnv {
  VITE_AMAP_KEY?: string
  VITE_AMAP_SECURITY_JS_CODE?: string
}
