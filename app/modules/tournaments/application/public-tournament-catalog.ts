import {
  isListedPublicly,
  isVisibleAtDirectUrl,
  toPublicTournament,
  tournamentStates,
} from '../domain/public-tournaments.ts'
import { type TournamentRepository } from './tournament-repository.ts'

export class PublicTournamentCatalog {
  constructor(private repository: TournamentRepository) {}

  async list() {
    const tournaments = await this.repository.list(tournamentStates.filter(isListedPublicly))

    return tournaments.map(toPublicTournament)
  }

  async find(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null

    const tournament = await this.repository.find(id)

    return tournament && isVisibleAtDirectUrl(tournament.state)
      ? toPublicTournament(tournament)
      : null
  }
}
