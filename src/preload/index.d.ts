import type { PackManagerApi } from '../shared/api'

declare global {
  interface Window {
    api: PackManagerApi
  }
}

export {}
