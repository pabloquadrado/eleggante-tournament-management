import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const ignored = new Set([
  'node_modules',
  '.git',
  '.agents',
  '.codex',
  '.aws',
  '.adonisjs',
  'build',
  'coverage',
  'tmp',
])
const errors: string[] = []
const imports = new Map<string, { target: string | null; name: string; node: ts.Node }[]>()
const entrypoints = new Map<string, ts.SourceFile>()
const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
  imports: Record<string, string>
}

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((entry) => !ignored.has(entry.name))
      .map(async (entry) => {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) {
          if (relative(root, path) === 'public/assets') return []
          return sources(path)
        }
        return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) ? [path] : []
      })
  )
  return files.flat()
}

function projectTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return relative(root, resolve(dirname(file), specifier))
  for (const [alias, target] of Object.entries(packageJson.imports)) {
    const prefix = alias.replace('*', '')
    if (specifier.startsWith(prefix))
      return target.replace('*', specifier.slice(prefix.length)).replace(/^\.\//, '')
  }
  return null
}

for (const file of await sources(root)) {
  const path = relative(root, file)
  if (!/\.(?:ts|tsx)$/.test(path) && path !== 'ace.js')
    errors.push(`${path}:1: Write project source and tooling in TypeScript.`)
  const source = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const domain = /^app\/modules\/[^/]+\/domain\//.test(path)
  const application = /^app\/modules\/[^/]+\/application\//.test(path)
  const entrypoint = /^(?:app\/(?:controllers|jobs|events|listeners|middleware)|commands)\//.test(
    path
  )
  const protectedLayer = domain || application || entrypoint
  const dependencies: { target: string | null; name: string; node: ts.Node }[] = []
  imports.set(path, dependencies)
  if (entrypoint) entrypoints.set(path, source)
  const report = (node: ts.Node, message: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
    errors.push(`${path}:${line}: ${message}`)
  }

  function check(node: ts.Node) {
    let specifier: ts.Node | undefined
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifier = node.arguments[0]
      if (protectedLayer && specifier && !ts.isStringLiteral(specifier))
        report(node, 'Use a literal dependency so its layer can be checked.')
    }
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text
      const target = projectTarget(file, name)
      dependencies.push({ target, name, node: specifier })
      if (target && /\.(?:js|jsx|mjs|cjs)$/.test(name))
        report(specifier, 'Import project source with .ts or .tsx.')
      if (
        name.startsWith('.') &&
        !['.ts', '.tsx', '.css', '.svg', '.png', '.jpg', '.json'].includes(extname(name))
      )
        report(specifier, 'Use an explicit TypeScript or asset extension.')
      if (
        protectedLayer &&
        (/^@adonisjs\/lucid(?:\/|$)/.test(name) || ['pg', 'knex', 'postgres'].includes(name))
      )
        report(specifier, 'Persistence packages belong in infrastructure.')
      if (
        protectedLayer &&
        target &&
        (/\/infrastructure\//.test(target) ||
          /^app\/models\//.test(target) ||
          /^providers\//.test(target))
      )
        report(
          specifier,
          'Depend on application interfaces, not concrete infrastructure or models.'
        )
      if ((domain || application) && /^@adonisjs\//.test(name))
        report(specifier, 'Domain and application code stay independent of AdonisJS.')
      if (
        (domain || application) &&
        target &&
        !new RegExp(
          `^app/modules/${path.split('/')[2]}/(?:domain${application ? '|application' : ''})/`
        ).test(target)
      )
        report(
          specifier,
          'Import inward within the module; expose an application contract for cross-module work.'
        )
    }
    ts.forEachChild(node, check)
  }
  check(source)
}

// Follow local barrels/helpers too: renaming a SQL dependency cannot hide it.
for (const [entrypoint, source] of entrypoints) {
  const visited = new Set<string>([entrypoint])
  function follow(path: string, chain: string[], originLine?: number) {
    for (const dependency of imports.get(path) ?? []) {
      const target = dependency.target?.replace(/\.js$/, '.ts') ?? null
      const line =
        originLine ??
        source.getLineAndCharacterOfPosition(dependency.node.getStart(source)).line + 1
      if (
        chain.length > 1 &&
        ((target &&
          (/\/infrastructure\//.test(target) ||
            /^app\/models\//.test(target) ||
            /^providers\//.test(target))) ||
          /^@adonisjs\/lucid(?:\/|$)/.test(dependency.name) ||
          ['pg', 'knex', 'postgres'].includes(dependency.name))
      ) {
        errors.push(
          `${entrypoint}:${line}: Indirect persistence dependency: ${[...chain, dependency.name].join(' -> ')}`
        )
      }
      if (target && !visited.has(target) && imports.has(target)) {
        visited.add(target)
        follow(target, [...chain, target], line)
      }
    }
  }
  follow(entrypoint, [entrypoint])
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log('Architecture check passed: TypeScript imports and inward dependencies.')
