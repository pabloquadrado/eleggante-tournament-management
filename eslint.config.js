import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

export default [
  ...configApp(...react),
  { ignores: ['database/schema.ts', 'public/assets/**'] },
  {
    rules: {
      '@unicorn/filename-case': ['error', { cases: { kebabCase: true } }],
      // URL-only links do not need a Tuyau registry or provider.
      '@adonisjs/prefer-adonisjs-inertia-link': 'off',
    },
  },
]
