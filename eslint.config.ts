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

      // Use the TypeScript-aware stylistic rule instead of the deprecated core rule.
      'padding-line-between-statements': 'off',
      '@stylistic/padding-line-between-statements': [
        'error',
        // Separate control flow and returns from preceding statements.
        {
          blankLine: 'always',
          prev: '*',
          next: ['return', 'if', 'try', 'switch', 'for', 'while'],
        },
        // Separate control-flow statements from subsequent statements.
        {
          blankLine: 'always',
          prev: ['if', 'try', 'switch', 'for', 'while'],
          next: '*',
        },
        // Keep related variable declarations together, then separate the next statement.
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
      ],
    },
  },
]
