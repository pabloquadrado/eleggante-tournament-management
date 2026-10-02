import { Head } from '@inertiajs/react'
import { Link } from '@inertiajs/react'

export default function NotFound() {
  return (
    <main className="arena-shell">
      <Head title="Página não encontrada" />
      <header className="arena-header">
        <Link href="/tournaments" className="arena-brand">
          Arena Eleggante
        </Link>
      </header>
      <section className="arena-empty" style={{ marginTop: 64 }}>
        <h1>Página não encontrada</h1>
        <p>Confira o endereço ou volte para os torneios.</p>
        <Link href="/tournaments" className="arena-link">
          Ver torneios
        </Link>
      </section>
    </main>
  )
}
