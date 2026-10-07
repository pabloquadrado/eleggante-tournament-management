import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ListPublicTournamentsUseCase } from '../modules/tournaments/application/use-cases/list-public-tournaments-use-case.ts'
import { FindPublicTournamentUseCase } from '../modules/tournaments/application/use-cases/find-public-tournament-use-case.ts'

@inject()
export default class PublicTournamentsController {
  constructor(
    private listTournaments: ListPublicTournamentsUseCase,
    private findTournament: FindPublicTournamentUseCase
  ) {}
  async index({ inertia }: HttpContext) {
    return inertia.render('tournaments/index', {
      tournaments: await this.listTournaments.execute({}),
    })
  }

  async show({ inertia, params, response }: HttpContext) {
    const tournament = await this.findTournament.execute({ id: params.id })

    if (!tournament) {
      response.status(404)

      return inertia.render('errors/not-found', {})
    }

    return inertia.render('tournaments/show', { tournament })
  }

  async apiIndex({ response }: HttpContext) {
    return response.ok({ data: await this.listTournaments.execute({}) })
  }

  async apiShow({ params, response }: HttpContext) {
    const tournament = await this.findTournament.execute({ id: params.id })

    return tournament
      ? response.ok({ data: tournament })
      : response.notFound({ error: 'Torneio não encontrado.' })
  }
}
