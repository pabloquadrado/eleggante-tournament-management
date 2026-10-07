/** #5 replaces this policy with exact-version acceptance checks at sign-in. */
export class ConsentPolicy {
  async hasCurrentAcceptance(_userId: string): Promise<boolean> {
    return false
  }
}
