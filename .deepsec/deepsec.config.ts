import { defineConfig } from 'deepsec/config'

export default defineConfig({
  defaultAgent: 'codex',
  projects: [
    { id: 'capgo', root: '..' },
    // <deepsec:projects-insert-above>
  ],
})
