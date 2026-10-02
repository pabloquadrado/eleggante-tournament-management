import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { eventId, givenCatalog, givenTournament } from '../support/public-tournament-fixtures.js'

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

  test('unexpected missing pages and server failures show recovery pages', async ({ client }) => {
    const missing = await client.get('/missing-page').withInertia()
    missing.assertStatus(404)
    missing.assertInertiaComponent('errors/not-found')

    const failed = await client.get('/__test__/server-error').withInertia()
    failed.assertStatus(500)
    failed.assertInertiaComponent('errors/server-error')
  })
})
