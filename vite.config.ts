import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/" so the
// same build works on a project page; local dev and preview default to "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
