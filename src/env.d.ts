/// <reference types="vite/client" />

interface AffonsoAPI {
  signup: (email: string) => void
}

interface Window {
  Affonso?: AffonsoAPI
}
