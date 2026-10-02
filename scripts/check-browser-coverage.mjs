import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import coverageLibrary from 'istanbul-lib-coverage'

const { createCoverageMap } = coverageLibrary

const rawDirectory = 'coverage/browser/raw'
const includedDirectory = 'inertia'
const excludedFiles = new Set(['inertia/ssr.tsx', 'inertia/types.ts'])
const metrics = ['lines', 'statements', 'branches', 'functions']

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) return sourceFiles(path)
      if (path.startsWith('inertia/tests/')) return []
      if (/\.(ts|tsx)$/.test(path) && !excludedFiles.has(path)) return [resolve(path)]
      return []
    })
  )
  return nested.flat()
}

const coverage = createCoverageMap({})
const rawFiles = (await readdir(rawDirectory)).filter((file) => file.endsWith('.json'))
if (rawFiles.length === 0) throw new Error('No browser coverage was collected')

for (const file of rawFiles) {
  coverage.merge(JSON.parse(await readFile(`${rawDirectory}/${file}`, 'utf8')))
}

const coveredPaths = new Map(coverage.files().map((file) => [resolve(file), file]))
let failed = false
for (const path of await sourceFiles(includedDirectory)) {
  const coveredPath = coveredPaths.get(path)
  if (!coveredPath) {
    console.error(`Missing browser coverage: ${path}`)
    failed = true
    continue
  }

  const summary = coverage.fileCoverageFor(coveredPath).toSummary().data
  for (const metric of metrics) {
    const { covered, total } = summary[metric]
    if (covered !== total) {
      console.error(`${path}: ${metric} ${covered}/${total}`)
      failed = true
    }
  }
}

if (failed) process.exitCode = 1
else console.log('Browser application source: 100% statements, branches, functions, and lines')
