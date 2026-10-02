import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import adonisjs from '@adonisjs/vite/client'
import instrumentLibrary from 'istanbul-lib-instrument'
import { relative } from 'node:path'

const { createInstrumenter } = instrumentLibrary

const coveragePlugin: Plugin = {
  name: 'source-browser-coverage',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0]
    const source = relative(process.cwd(), file)
    if (!source.startsWith('inertia/')) return
    if (!/\.(ts|tsx)$/.test(source)) return
    if (source === 'inertia/ssr.tsx' || source === 'inertia/types.ts') return
    if (source.startsWith('inertia/tests/')) return

    const instrumenter = createInstrumenter({
      coverageGlobalScope: 'globalThis',
      coverageGlobalScopeFunc: false,
      esModules: true,
      parserPlugins: ['typescript', 'jsx'],
      produceSourceMap: true,
    })
    const instrumentedCode = instrumenter.instrumentSync(code, file)
    const sourceMap = instrumenter.lastSourceMap()
    return { code: instrumentedCode, map: { ...sourceMap, version: 3 } }
  },
}

export default defineConfig({
  plugins: [
    react(),
    adonisjs({ entryPoints: ['inertia/app.tsx'], reload: ['resources/views/**/*.edge'] }),
    ...(process.env.VITE_COVERAGE === 'true' ? [coveragePlugin] : []),
  ],

  build: {
    sourcemap: process.env.VITE_COVERAGE === 'true',
  },

  /**
   * Define aliases for importing modules from
   * your frontend code
   */
  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})
