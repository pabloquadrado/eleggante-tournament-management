import { TournamentRepository } from '../../application/tournament-repository.ts'
import db from '@adonisjs/lucid/services/db'
import { type TournamentOverview, type TournamentState } from '../../domain/public-tournaments.ts'

type TournamentRow = {
  id: string
  title: string
  version: number
  state: TournamentState
  mode: TournamentOverview['mode']
  calendar_mode: TournamentOverview['calendarMode']
  starts_on: string | Date | null
  ends_on: string | Date | null
  venue_or_online_instructions: string | null
  game_edition: string
  created_at: Date
  updated_at: Date
}

function dateValue(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}

function timestampValue(value: Date): string {
  return value.toISOString()
}

function project(row: TournamentRow): TournamentOverview {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    state: row.state,
    mode: row.mode,
    calendarMode: row.calendar_mode,
    startsOn: dateValue(row.starts_on),
    endsOn: dateValue(row.ends_on),
    venueOrOnlineInstructions: row.venue_or_online_instructions,
    gameEdition: row.game_edition,
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  }
}

function query() {
  return db
    .from('tournaments as tournament')
    .innerJoin('game_editions as edition', 'edition.id', 'tournament.game_edition_id')
    .select(
      'tournament.id',
      'tournament.title',
      'tournament.version',
      'tournament.state',
      'tournament.mode',
      'tournament.calendar_mode',
      'tournament.starts_on',
      'tournament.ends_on',
      'tournament.venue_or_online_instructions',
      'edition.name as game_edition',
      'tournament.created_at',
      'tournament.updated_at'
    )
}

export class PostgresTournamentRepository extends TournamentRepository {
  async list(states: readonly TournamentState[]): Promise<TournamentOverview[]> {
    const rows = (await query()
      .whereIn('tournament.state', [...states])
      .orderBy('tournament.created_at', 'desc')) as TournamentRow[]

    return rows.map(project)
  }

  async find(id: string): Promise<TournamentOverview | null> {
    const row = (await query().where('tournament.id', id).first()) as TournamentRow | undefined

    return row ? project(row) : null
  }
}
