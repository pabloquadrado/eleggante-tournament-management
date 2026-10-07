import { isVisibleAtDirectUrl, toPublicTournament } from '../../domain/public-tournaments.ts'
import type { TournamentRepository } from '../tournament-repository.ts'

export class FindPublicTournamentUseCase {
  constructor(private repository: TournamentRepository) {}

  async execute(input: { id: string }) {
    const { id } = input

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null

    const tournament = await this.repository.find(id)

    return tournament && isVisibleAtDirectUrl(tournament.state)
      ? toPublicTournament(tournament)
      : null
  }
}
