import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  // GitHub Pages:
  // - User/Org site (<owner>.github.io): base should be '/'
  // - Project site (<owner>.github.io/<repo>/): base should be '/<repo>/'
  // We keep this configurable via an env var so local builds and CI can decide.
  const base = process.env.PAGES_BASE ?? '/'

  return {
    base,
    plugins: [react()],
  }
})
