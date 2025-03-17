declare module '@playwright/test' {
  interface Page {
    login: (email: string, password: string) => Promise<void>
  }
}
