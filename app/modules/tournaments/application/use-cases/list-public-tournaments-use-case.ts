import {
  isListedPublicly,
  toPublicTournament,
  tournamentStates,
} from '../../domain/public-tournaments.ts'
import type { TournamentRepository } from '../tournament-repository.ts'

export class ListPublicTournamentsUseCase {
  constructor(private repository: TournamentRepository) {}

  async execute(_input: Record<string, never>) {
    const tournaments = await this.repository.list(tournamentStates.filter(isListedPublicly))

    return tournaments.map(toPublicTournament)
  }
}
