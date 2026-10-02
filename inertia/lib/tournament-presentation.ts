import type { TournamentOverview } from '../../app/modules/tournaments/domain/public-tournaments'

const tournamentTimeZone = 'America/Sao_Paulo'
const utcNoonForCalendarDate = 'T12:00:00.000Z'
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: tournamentTimeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const stateLabels: Record<TournamentOverview['state'], string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  rejected: 'Rejeitado',
  registration_open: 'Inscrições abertas',
  registration_closed: 'Inscrições encerradas',
  in_progress: 'Em andamento',
  suspended: 'Suspenso',
  closed: 'Encerrado',
  canceled: 'Cancelado',
  archived: 'Arquivado',
}

export function formatTournamentDate(value: string | null, fallback: string): string {
  if (!value) return fallback
  return dateFormatter.format(new Date(`${value}${utcNoonForCalendarDate}`))
}
