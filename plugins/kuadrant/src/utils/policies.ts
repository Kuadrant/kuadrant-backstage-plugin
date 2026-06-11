import { PlanLimits } from '../types/api-management';

/**
 * Return PlanLimits as an array of human-readable strings.
 * Handles standard period fields (daily/weekly/monthly/yearly) and
 * custom limits (array of { limit, window }).
 */
export const getPlanLimitLines = (limits: PlanLimits | undefined): string[] => {
  if (!limits) return [];
  const parts: string[] = [];
  if (limits.daily) parts.push(`${limits.daily} per day`);
  if (limits.weekly) parts.push(`${limits.weekly} per week`);
  if (limits.monthly) parts.push(`${limits.monthly} per month`);
  if (limits.yearly) parts.push(`${limits.yearly} per year`);
  if (limits.custom) {
    for (const item of limits.custom) {
      parts.push(`${item.limit} per ${item.window}`);
    }
  }
  return parts;
};

/** Convenience wrapper that joins limit lines with a comma for single-line display. */
export const formatPlanLimits = (limits: PlanLimits | undefined): string =>
  getPlanLimitLines(limits).join(', ');

/**
 * Find a policy that targets a specific APIProduct
 *
 * @param policies - Array of policies with targetRef
 * @param routeNamespace - Namespace of the target HTTPRoute
 * @param routeName - Name of the target HTTPRoute
 * @returns The matching policy or null if not found
 *
 * @remarks
 * The function matches a policy if:
 * - The targetRef.kind is 'HTTPRoute'
 * - The targetRef.name matches the routeName parameter
 * - The targetRef.namespace (or policy's metadata.namespace if not specified) matches the routeNamespace parameter
 */
export const getPolicyForRoute = (
  policies: any[] | undefined,
  routeNamespace: string,
  routeName: string,
) => {
  if (!policies) return null;

  return policies.find((pp: any) => {
    const ref = pp.spec.targetRef;
    const targetNamespace = ref?.namespace ?? pp.metadata.namespace;

    return (
      ref?.kind === 'HTTPRoute' &&
      ref?.name === routeName &&
      targetNamespace === routeNamespace
    );
  }) || null;
};
