export const tournamentStates = [
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
] as const

export type TournamentState = (typeof tournamentStates)[number]

export type TournamentMode = 'in_person' | 'online'
export type CalendarMode = 'one_day' | 'multi_day'

const listedStates: ReadonlySet<TournamentState> = new Set([
  'registration_open',
  'registration_closed',
  'in_progress',
  'suspended',
  'closed',
  'canceled',
])

export function isListedPublicly(state: TournamentState): boolean {
  return listedStates.has(state)
}

export function isVisibleAtDirectUrl(state: TournamentState): boolean {
  return state === 'archived' || isListedPublicly(state)
}

export type TournamentOverview = {
  id: string
  title: string
  version: number
  state: TournamentState
  mode: TournamentMode
  calendarMode: CalendarMode
  startsOn: string | null
  endsOn: string | null
  venueOrOnlineInstructions: string | null
  gameEdition: string
  createdAt: string
  updatedAt: string
}

export function toPublicTournament(tournament: TournamentOverview): TournamentOverview {
  return {
    id: tournament.id,
    title: tournament.title,
    version: tournament.version,
    state: tournament.state,
    mode: tournament.mode,
    calendarMode: tournament.calendarMode,
    startsOn: tournament.startsOn,
    endsOn: tournament.endsOn,
    venueOrOnlineInstructions: tournament.venueOrOnlineInstructions,
    gameEdition: tournament.gameEdition,
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  }
}
