import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { captureBrowserCoverage } from '../support/browser-coverage.js'
import { eventId, givenCatalog, givenTournament } from '../support/public-tournament-fixtures.js'

test.group('Visitor tournament pages', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('a visitor sees a helpful empty state', async ({ visit }) => {
    const page = await visit('/tournaments')
    await page.getByRole('heading', { name: 'Nenhum torneio disponível no momento' }).waitFor()
    await captureBrowserCoverage(page, 'empty-list')
  })

  test('a visitor opens a listed tournament and returns to the list', async ({ visit }) => {
    await givenCatalog()
    await givenTournament('registration_open')

    const page = await visit('/tournaments')
    await page.getByRole('heading', { name: 'Copa Eleggante' }).waitFor()
    await page.getByText('Inscrições abertas').waitFor()
    await captureBrowserCoverage(page, 'listed-tournament')

    await page.getByRole('link', { name: /Ver torneio/ }).click()
    await page.getByRole('heading', { name: 'Copa Eleggante' }).waitFor()
    await page.getByText('Barbershop Eleggante').last().waitFor()
    await captureBrowserCoverage(page, 'tournament-detail')

    await page.getByRole('link', { name: /Todos os torneios/ }).click()
    await page.getByRole('heading', { name: 'Torneios', exact: true }).waitFor()
  })

  test('a visitor can open an archived tournament directly but cannot find it in the list', async ({
    visit,
  }) => {
    await givenCatalog()
    await givenTournament('archived')

    const list = await visit('/tournaments')
    await list.getByRole('heading', { name: 'Nenhum torneio disponível no momento' }).waitFor()
    await captureBrowserCoverage(list, 'archived-list')

    const detail = await visit(`/tournaments/${eventId}`)
    await detail.getByText('Arquivado').waitFor()
    await captureBrowserCoverage(detail, 'archived-detail')
  })

  test('a private tournament shows the same not-found page as an unknown address', async ({
    visit,
  }) => {
    await givenCatalog()
    await givenTournament('draft')

    const page = await visit(`/tournaments/${eventId}`)
    await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor()
    await captureBrowserCoverage(page, 'private-tournament')

    await page.getByRole('link', { name: 'Ver torneios' }).click()
    await page.getByRole('heading', { name: 'Nenhum torneio disponível no momento' }).waitFor()
  })

  test('an online tournament shows joining instructions and both dates', async ({ visit }) => {
    await givenCatalog()
    await givenTournament('in_progress')
    await db.from('tournaments').where('id', eventId).update({
      mode: 'online',
      calendar_mode: 'multi_day',
      ends_on: '2026-10-11',
      venue_or_online_instructions: 'Sala privada',
    })

    const list = await visit('/tournaments')
    await list.getByText('Online').waitFor()
    await captureBrowserCoverage(list, 'online-list')

    const detail = await visit(`/tournaments/${eventId}`)
    await detail.getByText('Como participar').waitFor()
    await detail.getByText('Sala privada').waitFor()
    await detail.getByText('11/10/2026').waitFor()
    await captureBrowserCoverage(detail, 'online-detail')
  })

  test('an undated tournament shows a date fallback', async ({ visit }) => {
    await givenCatalog()
    await givenTournament('registration_open')
    await db.from('tournaments').where('id', eventId).update({ starts_on: null })

    const page = await visit('/tournaments')
    await page.getByText('Data a definir').waitFor()
    await captureBrowserCoverage(page, 'undated-tournament')
  })

  test('a server error page offers a way back to tournaments', async ({ visit }) => {
    const page = await visit('/__test__/server-error')
    await page.getByRole('heading', { name: 'Ocorreu um erro' }).waitFor()
    await page.getByRole('link', { name: 'Ver torneios' }).waitFor()
    await captureBrowserCoverage(page, 'server-error')
  })
})
