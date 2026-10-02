import type { HttpContext } from '@adonisjs/core/http'
import { PostgresPublicTournamentCatalog } from '../modules/tournaments/infrastructure/postgres-public-tournament-catalog.js'

const catalog = new PostgresPublicTournamentCatalog()

export default class PublicTournamentsController {
  async index({ inertia }: HttpContext) {
    return inertia.render('tournaments/index', { tournaments: await catalog.list() })
  }

  async show({ inertia, params, response }: HttpContext) {
    const tournament = await catalog.find(params.id)
    if (!tournament) {
      response.status(404)
      return inertia.render('errors/not-found', {})
    }
    return inertia.render('tournaments/show', { tournament })
  }

  async apiIndex({ response }: HttpContext) {
    return response.ok({ data: await catalog.list() })
  }

  async apiShow({ params, response }: HttpContext) {
    const tournament = await catalog.find(params.id)
    return tournament
      ? response.ok({ data: tournament })
      : response.notFound({ error: 'Torneio não encontrado.' })
  }
}
