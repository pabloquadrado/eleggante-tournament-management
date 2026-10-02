import { test } from '@japa/runner'

import {
  isListedPublicly,
  isVisibleAtDirectUrl,
  toPublicTournament,
  tournamentStates,
} from '../../app/modules/tournaments/domain/public-tournaments.js'

test('a visitor sees only published tournaments in the default list', ({ assert }) => {
  const listed = tournamentStates.filter(isListedPublicly)

  assert.deepEqual(listed, [
    'registration_open',
    'registration_closed',
    'in_progress',
    'suspended',
    'closed',
    'canceled',
  ])
})

test('an archived tournament is available by direct URL, while private states remain hidden', ({
  assert,
}) => {
  assert.equal(isVisibleAtDirectUrl('archived'), true)
  assert.equal(isListedPublicly('archived'), false)
  assert.equal(isVisibleAtDirectUrl('draft'), false)
  assert.equal(isVisibleAtDirectUrl('pending_approval'), false)
  assert.equal(isVisibleAtDirectUrl('rejected'), false)
})

test('public tournament data includes only approved overview fields', ({ assert }) => {
  const tournament = {
    id: '53f03ebc-23e0-4c86-a33c-816df42ceba0',
    title: 'Copa Eleggante',
    version: 2,
    state: 'registration_open' as const,
    mode: 'in_person' as const,
    calendarMode: 'one_day' as const,
    startsOn: '2026-10-10',
    endsOn: null,
    venueOrOnlineInstructions: 'Barbershop Eleggante',
    gameEdition: 'EA FC 26',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    creatorEmail: 'owner@example.test',
    administratorNotes: 'Private',
    onlineAccessCode: 'Secret',
    unpublishedResult: { home: 5, away: 0 },
  }

  assert.deepEqual(toPublicTournament(tournament), {
    id: '53f03ebc-23e0-4c86-a33c-816df42ceba0',
    title: 'Copa Eleggante',
    version: 2,
    state: 'registration_open',
    mode: 'in_person',
    calendarMode: 'one_day',
    startsOn: '2026-10-10',
    endsOn: null,
    venueOrOnlineInstructions: 'Barbershop Eleggante',
    gameEdition: 'EA FC 26',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  })
})
