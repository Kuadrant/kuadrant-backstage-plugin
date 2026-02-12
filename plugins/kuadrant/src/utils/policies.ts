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
