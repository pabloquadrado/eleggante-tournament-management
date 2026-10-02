import { Head } from '@inertiajs/react'
import { Link } from '@inertiajs/react'

export default function ServerError() {
  return (
    <main className="arena-shell">
      <Head title="Ocorreu um erro" />
      <header className="arena-header">
        <Link href="/tournaments" className="arena-brand">
          Arena Eleggante
        </Link>
      </header>
      <section className="arena-empty" style={{ marginTop: 64 }}>
        <h1>Ocorreu um erro</h1>
        <p>Tente novamente em instantes.</p>
        <Link href="/tournaments" className="arena-link">
          Ver torneios
        </Link>
      </section>
    </main>
  )
}
