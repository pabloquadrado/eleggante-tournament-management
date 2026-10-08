import { assert } from '@japa/assert'
import { configure, run } from '@japa/runner'
import { spec } from '@japa/runner/reporters'

configure({
  files: ['tests/workflow/**/*.spec.ts', 'tests/workflow-adapters/**/*.spec.ts'],
  plugins: [assert()],
  reporters: { activated: ['spec'], list: [spec()] },
  timeout: 10000,
})

await run()
