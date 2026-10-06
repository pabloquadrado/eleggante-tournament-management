import { Head } from '@inertiajs/react'
import { Link } from '@inertiajs/react'
import type { TournamentOverview } from '../../../app/modules/tournaments/domain/public-tournaments.ts'
import { formatTournamentDate, stateLabels } from '../../lib/tournament-presentation.ts'

export default function TournamentIndex({ tournaments }: { tournaments: TournamentOverview[] }) {
  return (
    <main className="arena-shell">
      <Head title="Torneios" />
      <header className="arena-header">
        <a href="/tournaments" className="arena-brand">
          Arena Eleggante
        </a>
      </header>
      <Link href="/sign-in" className="arena-link">
        Entrar
      </Link>
      <section className="arena-intro">
        <p className="arena-eyebrow">Arena Eleggante</p>
        <h1>Torneios</h1>
        <p>Acompanhe os torneios e encontre os detalhes de cada competição.</p>
      </section>
      {tournaments.length === 0 ? (
        <section className="arena-empty" aria-live="polite">
          <h2>Nenhum torneio disponível no momento</h2>
          <p>Quando houver torneios públicos, eles aparecerão aqui.</p>
        </section>
      ) : (
        <section className="arena-grid" aria-label="Torneios disponíveis">
          {tournaments.map((tournament) => (
            <article className="arena-card" key={tournament.id}>
              <span className="arena-status">{stateLabels[tournament.state]}</span>
              <h2>{tournament.title}</h2>
              <p>{tournament.gameEdition}</p>
              <dl>
                <div>
                  <dt>Data</dt>
                  <dd>{formatTournamentDate(tournament.startsOn, 'Data a definir')}</dd>
                </div>
                <div>
                  <dt>Formato</dt>
                  <dd>{tournament.mode === 'online' ? 'Online' : 'Presencial'}</dd>
                </div>
              </dl>
              <Link href={`/tournaments/${tournament.id}`} className="arena-link">
                Ver torneio <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
