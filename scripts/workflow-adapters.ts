import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { profiles, type Profile } from './agent-workflow/models.ts'
import { configureAdapters } from './workflow-adapters/files.ts'
import { doctorAdapters } from './workflow-adapters/doctor.ts'
import { harnesses, validateSupport, type Harness } from './workflow-adapters/render.ts'

export async function adaptersCli(args: string[], cwd = process.cwd()): Promise<number> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'harness': { type: 'string' },
      'profile': { type: 'string' },
      'engineer': { type: 'string' },
      'root': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const [command, ...extra] = parsed.positionals
  const { harness, profile, engineer } = parsed.values

  if (
    !['configure', 'doctor'].includes(command) ||
    extra.length ||
    !harnesses.includes(harness as Harness) ||
    !profiles.includes(profile as Profile) ||
    (engineer && engineer !== 'kimi')
  ) {
    throw new Error(
      'Usage: workflow-adapters.ts <configure|doctor> --harness <codex|claude|opencode> --profile <openai|anthropic> [--engineer kimi] [--dry-run] [--root <directory>]'
    )
  }

  const options = {
    harness: harness as Harness,
    profile: profile as Profile,
    engineer: engineer === 'kimi' ? ('kimi-k3' as const) : undefined,
  }

  validateSupport(options)
  const root = resolve(cwd, parsed.values.root ?? '.')

  if (command === 'configure') {
    const files = await configureAdapters(root, options, parsed.values['dry-run'])

    process.stdout.write(
      `${JSON.stringify({ harness, profile, dryRun: parsed.values['dry-run'], files: files.map((file) => (parsed.values['dry-run'] ? file : { path: file.path, action: file.action })) }, null, 2)}\n`
    )

    return 0
  }

  const result = await doctorAdapters(root, options)

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

  return result.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await adaptersCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 1
  }
}
