import type { TournamentOverview, TournamentState } from '../domain/public-tournaments.ts'

export abstract class TournamentRepository {
  abstract list(states: readonly TournamentState[]): Promise<TournamentOverview[]>
  abstract find(id: string): Promise<TournamentOverview | null>
}
