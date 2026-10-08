import { test } from '@japa/runner'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import type { CommandPort } from '../../scripts/agent-workflow/runtime.ts'
import { fixture } from './support.ts'

function aliasBoundary(origin: string, resolvedHost: string, baseCommit: string) {
  const commands: string[][] = []
  const port: CommandPort = {
    execute: async (argv) => {
      commands.push(argv)
      let stdout = ''

      if (argv[0] === 'git' && argv[1] === 'remote') stdout = origin
      else if (argv[0] === 'ssh' && argv[1] === '-G')
        stdout = `host github.com-work\nhostname ${resolvedHost}\nuser git\n`
      else if (argv[0] === 'gh' && argv[1] === 'issue')
        stdout = JSON.stringify({
          number: Number(argv[3]),
          title: 'Approved story',
          url: `https://github.com/example/repo/issues/${argv[3]}`,
          body: 'Approved public contract',
          comments: [],
        })
      else if (argv[0] === 'git' && argv[1] === 'ls-remote')
        stdout = `${baseCommit}\trefs/heads/main`
      else if (!(argv[0] === 'git' && argv[1] === 'ls-tree'))
        throw new Error(`Unexpected command: ${argv.join(' ')}`)

      return { exitCode: 0, stdout, stderr: '' }
    },
  }

  return { commands, port }
}

test('a GitHub SSH Host alias resolves through local SSH settings before source refinement', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    for (const origin of [
      'git@github.com-work:example/repo.git',
      'ssh://git@github.com-work/example/repo.git',
    ]) {
      const { commands, port } = aliasBoundary(origin, 'github.com', context.run.commit)
      const runtime = new LocalWorkflowRuntime(context.directory, port)
      const source = await runtime.sources.snapshot('4', {
        profile: 'openai',
        repo: 'example/repo',
      })

      assert.equal(source.issue.url, 'https://github.com/example/repo/issues/4')
      assert.equal(source.spec?.url, 'https://github.com/example/repo/issues/1')
      assert.equal(source.baseSha, context.run.commit)
      assert.isTrue(
        source.blockers.some((blocker) => blocker.includes('Approved PRD is unavailable'))
      )
      assert.isTrue(commands.some((argv) => argv[0] === 'ssh' && argv[1] === '-G'))
      assert.isFalse(commands.some((argv) => argv[0] === 'git' && argv[1] === 'worktree'))
    }
  } finally {
    await context.cleanup()
  }
})

test('a GitHub-looking SSH alias resolving to another host fails before GitHub source access', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    for (const resolvedHost of ['foreign.example', 'github.com.attacker.example']) {
      const { commands, port } = aliasBoundary(
        'git@github.com-work:example/repo.git',
        resolvedHost,
        context.run.commit
      )
      const runtime = new LocalWorkflowRuntime(context.directory, port)

      await assert.rejects(
        () => runtime.sources.snapshot('4', { profile: 'openai', repo: 'example/repo' }),
        /same GitHub repository/
      )
      assert.isTrue(commands.some((argv) => argv[0] === 'ssh' && argv[1] === '-G'))
      assert.isFalse(commands.some((argv) => argv[0] === 'gh'))
      assert.isFalse(commands.some((argv) => argv[0] === 'git' && argv[1] === 'ls-remote'))
    }
  } finally {
    await context.cleanup()
  }
})
