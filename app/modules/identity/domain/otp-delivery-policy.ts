export const deliveryPolicy = {
  maxAttempts: 5,
  backoffSeconds: 30,
  replayRetentionMilliseconds: 24 * 60 * 60 * 1000,
} as const
