import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import { formatTournamentDate, stateLabels } from '../lib/tournament-presentation.ts'

test('visitor dates use the São Paulo calendar and keep the supplied fallback', () => {
  assert.equal(formatTournamentDate('2026-10-10', 'A definir'), '10/10/2026')
  assert.equal(formatTournamentDate(null, 'A definir'), 'A definir')
})

test('every tournament state has a visitor label', () => {
  assert.deepEqual(
    Object.keys(stateLabels).sort(),
    [
      'draft',
      'pending_approval',
      'rejected',
      'registration_open',
      'registration_closed',
      'in_progress',
      'suspended',
      'closed',
      'canceled',
      'archived',
    ].sort()
  )
  assert.equal(stateLabels.registration_open, 'Inscrições abertas')
})
