import { StatusCondition } from '../types/api-management';

/**
 * Derives the APIKey approval phase from Kubernetes conditions.
 *
 * Maps conditions to phases:
 * - Empty conditions array → Pending
 * - Approved condition (status: True) → Approved
 * - Denied condition (status: True) → Denied
 * - Failed condition (status: True) → Failed
 *
 * @param conditions - Array of Kubernetes status conditions
 * @returns Current approval phase
 */
export function getAPIKeyPhase(
  conditions?: StatusCondition[]
): 'Pending' | 'Approved' | 'Denied' | 'Failed' {
  if (!conditions || conditions.length === 0) {
    return 'Pending';
  }

  const approved = conditions.find(
    c => c.type === 'Approved' && c.status === 'True'
  );
  if (approved) return 'Approved';

  const denied = conditions.find(
    c => c.type === 'Denied' && c.status === 'True'
  );
  if (denied) return 'Denied';

  const failed = conditions.find(
    c => c.type === 'Failed' && c.status === 'True'
  );
  if (failed) return 'Failed';

  return 'Pending';
}
