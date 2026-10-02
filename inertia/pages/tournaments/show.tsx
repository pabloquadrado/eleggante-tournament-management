import { Head } from '@inertiajs/react'
import { Link } from '@inertiajs/react'
import type { TournamentOverview } from '../../../app/modules/tournaments/domain/public-tournaments'
import { formatTournamentDate, stateLabels } from '../../lib/tournament-presentation'

export default function TournamentShow({ tournament }: { tournament: TournamentOverview }) {
  return (
    <main className="arena-shell">
      <Head title={tournament.title} />
      <header className="arena-header">
        <a href="/tournaments" className="arena-brand">
          Arena Eleggante
        </a>
        <Link href="/tournaments" className="arena-back">
          ← Todos os torneios
        </Link>
      </header>
      <article className="arena-detail">
        <span className="arena-status">{stateLabels[tournament.state]}</span>
        <h1>{tournament.title}</h1>
        <p className="arena-subtitle">{tournament.gameEdition}</p>
        <dl className="arena-facts">
          <div>
            <dt>Início</dt>
            <dd>{formatTournamentDate(tournament.startsOn, 'A definir')}</dd>
          </div>
          {tournament.endsOn && (
            <div>
              <dt>Fim</dt>
              <dd>{formatTournamentDate(tournament.endsOn, 'A definir')}</dd>
            </div>
          )}
          <div>
            <dt>Formato</dt>
            <dd>{tournament.mode === 'online' ? 'Online' : 'Presencial'}</dd>
          </div>
          {tournament.venueOrOnlineInstructions && (
            <div>
              <dt>{tournament.mode === 'online' ? 'Como participar' : 'Local'}</dt>
              <dd>{tournament.venueOrOnlineInstructions}</dd>
            </div>
          )}
        </dl>
      </article>
    </main>
  )
}
