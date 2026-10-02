import { BaseSeeder } from '@adonisjs/lucid/seeders'

const organizationId = '5a1486b1-a0a2-44bd-9d95-72911016f544'
const gameId = '8983adad-85bb-4259-8508-4b36039779b0'
const editionId = '65a5b58d-91b6-4a46-bd2a-c99eb1520eb0'

export default class LocalPublicTournamentsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const now = new Date().toISOString()
    await this.client
      .table('organizations')
      .insert({
        id: organizationId,
        name: 'Barbershop Eleggante',
        slug: 'barbershop-eleggante',
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()
    await this.client
      .table('games')
      .insert({
        id: gameId,
        code: 'ea-fc',
        name: 'EA FC',
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()
    await this.client
      .table('game_editions')
      .insert({
        id: editionId,
        game_id: gameId,
        code: 'ea-fc-26',
        name: 'EA FC 26',
        release_year: 2025,
        selectable: true,
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()

    await this.client
      .table('tournaments')
      .insert([
        {
          id: '0087fc67-2ca2-4efe-8923-dbb1ab6634be',
          organization_id: organizationId,
          game_edition_id: editionId,
          title: 'Copa Eleggante',
          state: 'registration_open',
          version: 1,
          mode: 'in_person',
          calendar_mode: 'one_day',
          starts_on: '2026-10-10',
          venue_or_online_instructions: 'Barbershop Eleggante',
          created_at: now,
          updated_at: now,
        },
        {
          id: '991f529b-cbdb-4392-bfbd-e314d9a4b4a5',
          organization_id: organizationId,
          game_edition_id: editionId,
          title: 'Torneio de Primavera',
          state: 'in_progress',
          version: 1,
          mode: 'online',
          calendar_mode: 'multi_day',
          starts_on: '2026-10-01',
          ends_on: '2026-10-15',
          venue_or_online_instructions: 'Partidas online',
          created_at: now,
          updated_at: now,
        },
        {
          id: '54e762a1-c8d6-440b-b2a1-b02f269be8c1',
          organization_id: organizationId,
          game_edition_id: editionId,
          title: 'Copa de Inverno',
          state: 'archived',
          version: 1,
          mode: 'in_person',
          calendar_mode: 'one_day',
          starts_on: '2026-07-18',
          venue_or_online_instructions: 'Barbershop Eleggante',
          created_at: now,
          updated_at: now,
        },
      ])
      .onConflict('id')
      .ignore()
  }
}
