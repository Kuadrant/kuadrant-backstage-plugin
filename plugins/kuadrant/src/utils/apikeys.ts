import { StatusCondition } from '../types/api-management';

/**
 * Parses a date picker value (YYYY-MM-DD) as local calendar date at end of day.
 * Avoids UTC-parsing pitfalls where new Date("YYYY-MM-DD") is treated as UTC midnight.
 */
export function customDateToISO(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}

/**
 * Returns true if the custom date is invalid (in the past or today).
 * Only relevant when expiryDays === 'custom'.
 */
export function isCustomDateInvalid(expiryDays: string, customDate: string): boolean {
  if (expiryDays !== 'custom') return false;
  if (!customDate) return true;
  const [year, month, day] = customDate.split('-').map(Number);
  const selected = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected <= today;
}

/**
 * Derives the APIKey approval phase from Kubernetes conditions.
 *
 * Maps conditions to phases:
 * - Empty conditions array → Pending
 * - Expired condition (status: True) → Expired
 * - Approved condition (status: True) → Approved
 * - Denied condition (status: True) → Denied
 * - Failed condition (status: True) → Failed
 *
 * @param conditions - Array of Kubernetes status conditions
 * @returns Current approval phase
 */
export function getAPIKeyPhase(
  conditions?: StatusCondition[]
): 'Pending' | 'Approved' | 'Denied' | 'Failed' | 'Expired' {
  if (!conditions || conditions.length === 0) {
    return 'Pending';
  }

  const expired = conditions.find(
    c => c.type === 'Expired' && c.status === 'True'
  );
  if (expired) return 'Expired';

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
