declare module '@adonisjs/eslint-config' {
  import type { Linter } from 'eslint'
  export function configApp(...blocks: Linter.Config[]): Linter.Config[]
}

declare module '@adonisjs/eslint-config/react' {
  import type { Linter } from 'eslint'
  export const react: Linter.Config[]
}
