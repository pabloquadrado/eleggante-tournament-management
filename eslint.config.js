import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

export default [
  ...configApp(...react),
  { ignores: ['database/schema.ts', 'public/assets/**'] },
  { rules: { '@unicorn/filename-case': ['error', { cases: { kebabCase: true } }] } },
]
