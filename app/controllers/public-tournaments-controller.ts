import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { PublicTournamentCatalog } from '../modules/tournaments/application/public-tournament-catalog.ts'

@inject()
export default class PublicTournamentsController {
  constructor(private catalog: PublicTournamentCatalog) {}
  async index({ inertia }: HttpContext) {
    return inertia.render('tournaments/index', { tournaments: await this.catalog.list() })
  }

  async show({ inertia, params, response }: HttpContext) {
    const tournament = await this.catalog.find(params.id)
    if (!tournament) {
      response.status(404)
      return inertia.render('errors/not-found', {})
    }
    return inertia.render('tournaments/show', { tournament })
  }

  async apiIndex({ response }: HttpContext) {
    return response.ok({ data: await this.catalog.list() })
  }

  async apiShow({ params, response }: HttpContext) {
    const tournament = await this.catalog.find(params.id)
    return tournament
      ? response.ok({ data: tournament })
      : response.notFound({ error: 'Torneio não encontrado.' })
  }
}
