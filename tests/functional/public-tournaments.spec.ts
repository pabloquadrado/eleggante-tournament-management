import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

const organizationId = '5a1486b1-a0a2-44bd-9d95-72911016f544'
const gameId = '8983adad-85bb-4259-8508-4b36039779b0'
const editionId = '65a5b58d-91b6-4a46-bd2a-c99eb1520eb0'
const eventId = '0087fc67-2ca2-4efe-8923-dbb1ab6634be'
const now = '2026-09-30T12:00:00.000Z'

async function givenCatalog() {
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

async function givenTournament(state: string, id = eventId) {
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

test.group('Public tournaments', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('empty listing has no tournaments in the API and visitor page', async ({ client }) => {
    const api = await client.get('/api/v1/tournaments')
    api.assertStatus(200)
    api.assertBody({ data: [] })

    const page = await client.get('/tournaments').withInertia()
    page.assertStatus(200)
    page.assertInertiaComponent('tournaments/index')
    page.assertInertiaPropsContains({ tournaments: [] })
  })

  test('a visitor can find and open a public tournament without private data', async ({
    client,
    assert,
  }) => {
    await givenCatalog()
    await givenTournament('registration_open')

    const listing = await client.get('/api/v1/tournaments')
    listing.assertStatus(200)
    const [overview] = listing.body().data
    assert.deepEqual(
      Object.keys(overview).sort(),
      [
        'calendarMode',
        'createdAt',
        'endsOn',
        'gameEdition',
        'id',
        'mode',
        'startsOn',
        'state',
        'title',
        'updatedAt',
        'venueOrOnlineInstructions',
        'version',
      ].sort()
    )
    assert.equal(overview.title, 'Copa Eleggante')
    assert.equal(overview.gameEdition, 'EA FC 26')

    const detail = await client.get(`/api/v1/tournaments/${eventId}`)
    detail.assertStatus(200)
    detail.assertBody({ data: overview })

    const page = await client.get(`/tournaments/${eventId}`).withInertia()
    page.assertStatus(200)
    page.assertInertiaComponent('tournaments/show')
    page.assertInertiaPropsContains({ tournament: overview })
  })

  test('private and unknown tournaments are indistinguishable to visitors', async ({ client }) => {
    await givenCatalog()
    await givenTournament('draft')

    const listing = await client.get('/api/v1/tournaments')
    listing.assertBody({ data: [] })

    const privateDetail = await client.get(`/api/v1/tournaments/${eventId}`)
    const unknownDetail = await client.get(
      '/api/v1/tournaments/639c8c2b-4d3b-49fc-b8ed-764a3e2445dd'
    )
    privateDetail.assertStatus(404)
    unknownDetail.assertStatus(404)
    privateDetail.assertBody(unknownDetail.body())

    const privatePage = await client.get(`/tournaments/${eventId}`).withInertia()
    privatePage.assertStatus(404)
    privatePage.assertInertiaComponent('errors/not-found')

    const unknownPage = await client
      .get('/tournaments/639c8c2b-4d3b-49fc-b8ed-764a3e2445dd')
      .withInertia()
    unknownPage.assertStatus(404)
    unknownPage.assertInertiaComponent('errors/not-found')

    const invalidId = await client.get('/api/v1/tournaments/invalid-id')
    invalidId.assertStatus(404)
    invalidId.assertBody(unknownDetail.body())
  })

  test('an archived tournament is accessible only through its direct URL', async ({ client }) => {
    await givenCatalog()
    await givenTournament('archived')

    const listing = await client.get('/api/v1/tournaments')
    listing.assertBody({ data: [] })

    const detail = await client.get(`/api/v1/tournaments/${eventId}`)
    detail.assertStatus(200)
    detail.assertBodyContains({ data: { state: 'archived' } })

    const page = await client.get(`/tournaments/${eventId}`).withInertia()
    page.assertStatus(200)
    page.assertInertiaComponent('tournaments/show')
  })
})
