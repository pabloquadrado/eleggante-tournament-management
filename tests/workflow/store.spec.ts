import { open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { FileRunStore } from '../../scripts/agent-workflow/store.ts'
import { fixture } from './support.ts'

test('concurrent commands cannot acquire the same run lock or remove its owner lock', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const path = join(context.store.directory(context.run.id), 'lock.json')
    const owner = await open(path, 'wx')

    await owner.writeFile('{"pid":999999,"hostname":"other-machine"}')
    await owner.close()
    await assert.rejects(() => context.controller.resume(context.run.id), /is locked/)
    assert.equal(await readFile(path, 'utf8'), '{"pid":999999,"hostname":"other-machine"}')
  } finally {
    await context.cleanup()
  }
})

test('run IDs cannot escape storage and malformed state cannot resume', async ({ assert }) => {
  const context = await fixture()

  try {
    const store = new FileRunStore(join(context.directory, 'other-runs'))

    assert.throws(() => store.directory('../outside'), /Invalid run ID/)
    await writeFile(
      join(context.store.directory(context.run.id), 'state.json'),
      JSON.stringify({ schemaVersion: 99, id: context.run.id })
    )
    await assert.rejects(() => context.controller.resume(context.run.id), /Invalid persisted run/)
  } finally {
    await context.cleanup()
  }
})
