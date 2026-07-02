import type { Router } from 'vue-router'

export function routePreviewScan(router: Router, previewUrl: string) {
  return router.push({
    path: '/scan',
    query: { preview: previewUrl },
  })
}
