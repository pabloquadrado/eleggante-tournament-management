import db from '@adonisjs/lucid/services/db'

export const organizationId = '5a1486b1-a0a2-44bd-9d95-72911016f544'
export const gameId = '8983adad-85bb-4259-8508-4b36039779b0'
export const editionId = '65a5b58d-91b6-4a46-bd2a-c99eb1520eb0'
export const eventId = '0087fc67-2ca2-4efe-8923-dbb1ab6634be'
const now = '2026-09-30T12:00:00.000Z'

export async function givenCatalog() {
  await db.table('organizations').insert({
    id: organizationId,
    name: 'Barbershop Eleggante',
    slug: 'barbershop-eleggante',
    created_at: now,
    updated_at: now,
  })
  await db.table('games').insert({
    id: gameId,
    code: 'ea-fc',
    name: 'EA FC',
    created_at: now,
    updated_at: now,
  })
  await db.table('game_editions').insert({
    id: editionId,
    game_id: gameId,
    code: 'ea-fc-26',
    name: 'EA FC 26',
    release_year: 2025,
    selectable: true,
    created_at: now,
    updated_at: now,
  })
}

export async function givenTournament(state: string, id = eventId) {
  await db.table('tournaments').insert({
    id,
    organization_id: organizationId,
    game_edition_id: editionId,
    title: 'Copa Eleggante',
    state,
    version: 1,
    mode: 'in_person',
    calendar_mode: 'one_day',
    starts_on: '2026-10-10',
    ends_on: null,
    venue_or_online_instructions: 'Barbershop Eleggante',
    created_at: now,
    updated_at: now,
  })
}
