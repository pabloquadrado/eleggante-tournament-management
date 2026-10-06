import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/** One lock order for V1 identity writes avoids resend/verify/profile deadlocks. */
export async function lockIdentityWrites(transaction: TransactionClientContract) {
  await transaction.rawQuery(
    "SELECT pg_advisory_xact_lock(hashtextextended('arena-identity-writes', 0))"
  )
}
