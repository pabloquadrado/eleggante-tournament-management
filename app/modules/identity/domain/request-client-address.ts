/** Unavailable connection metadata shares one abuse-control bucket. */
export function requestClientAddress(remoteAddress: string | undefined): string {
  return remoteAddress ?? 'unknown'
}
