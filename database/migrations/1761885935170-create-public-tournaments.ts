import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      DO $$ BEGIN CREATE TYPE tournament_state AS ENUM (
        'draft', 'pending_approval', 'rejected', 'registration_open',
        'registration_closed', 'in_progress', 'suspended', 'closed',
        'canceled', 'archived'
      ); EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
    this.schema.raw(
      "DO $$ BEGIN CREATE TYPE tournament_mode AS ENUM ('in_person', 'online'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    this.schema.raw(
      "DO $$ BEGIN CREATE TYPE calendar_mode AS ENUM ('one_day', 'multi_day'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )

    this.schema.createTable('organizations', (table) => {
      table.uuid('id').primary()
      table.string('name').notNullable()
      table.string('slug').notNullable().unique()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('games', (table) => {
      table.uuid('id').primary()
      table.string('code').notNullable().unique()
      table.string('name').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('game_editions', (table) => {
      table.uuid('id').primary()
      table.uuid('game_id').notNullable().references('games.id')
      table.string('code').notNullable()
      table.string('name').notNullable()
      table.integer('release_year').notNullable()
      table.boolean('selectable').notNullable()
      table.unique(['game_id', 'code'])
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('tournaments', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable().references('organizations.id')
      table.uuid('game_edition_id').notNullable().references('game_editions.id')
      table.string('title').notNullable()
      table.specificType('state', 'tournament_state').notNullable()
      table.integer('version').notNullable().defaultTo(1)
      table.specificType('mode', 'tournament_mode').notNullable()
      table.specificType('calendar_mode', 'calendar_mode').notNullable()
      table.date('starts_on').nullable()
      table.date('ends_on').nullable()
      table.text('venue_or_online_instructions').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['state', 'created_at'])
    })

    this.schema.raw(`
      ALTER TABLE tournaments ADD CONSTRAINT multi_day_dates_required
      CHECK (calendar_mode <> 'multi_day' OR
        (starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on >= starts_on))
    `)
  }

  async down() {
    this.schema.dropTable('tournaments')
    this.schema.dropTable('game_editions')
    this.schema.dropTable('games')
    this.schema.dropTable('organizations')
    this.schema.raw('DROP TYPE calendar_mode')
    this.schema.raw('DROP TYPE tournament_mode')
    this.schema.raw('DROP TYPE tournament_state')
  }
}
