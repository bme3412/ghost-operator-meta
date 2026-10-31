import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

const rendererRoot = resolve(process.cwd(), 'src/renderer')
const page = (name: string): string => resolve(rendererRoot, `${name}.html`)

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: rendererRoot,
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          'target-offline': page('target-offline'),
          panel: page('panel')
        }
      }
    }
  }
})
