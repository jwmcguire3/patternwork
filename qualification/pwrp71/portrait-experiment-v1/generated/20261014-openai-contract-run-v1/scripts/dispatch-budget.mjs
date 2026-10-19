// Count any provider request that reached, or could have reached, the provider.
// Only a hash-bound, reconciled pre-dispatch failure is excluded.
export function countPotentialProviderDispatches(calls) {
  if (!Array.isArray(calls)) throw new TypeError("Journal calls must be an array.");
  return calls.filter((call) => call?.status !== "failed_before_provider_dispatch").length;
}
