import { bootstrapPlatformApp } from './bootstrap'

bootstrapPlatformApp({
  loadHostedApplications: () => import('./bootstrap-hosted-applications')
})
