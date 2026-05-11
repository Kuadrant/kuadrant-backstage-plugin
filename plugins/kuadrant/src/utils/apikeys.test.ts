import { getAPIKeyPhase } from './apikeys';

describe('getAPIKeyPhase', () => {
  it('returns Pending when conditions array is empty', () => {
    const result = getAPIKeyPhase([]);
    expect(result).toBe('Pending');
  });

  it('returns Pending when conditions is undefined', () => {
    const result = getAPIKeyPhase(undefined);
    expect(result).toBe('Pending');
  });

  it('returns Approved when Approved condition status is True', () => {
    const conditions = [
      { type: 'Approved', status: 'True' as const }
    ];
    const result = getAPIKeyPhase(conditions);
    expect(result).toBe('Approved');
  });

  it('returns Denied when Denied condition status is True', () => {
    const conditions = [
      { type: 'Denied', status: 'True' as const }
    ];
    const result = getAPIKeyPhase(conditions);
    expect(result).toBe('Denied');
  });

  it('returns Failed when Failed condition status is True', () => {
    const conditions = [
      { type: 'Failed', status: 'True' as const }
    ];
    const result = getAPIKeyPhase(conditions);
    expect(result).toBe('Failed');
  });

  it('returns Approved when both Approved and Denied conditions exist', () => {
    const conditions = [
      { type: 'Denied', status: 'True' as const },
      { type: 'Approved', status: 'True' as const }
    ];
    const result = getAPIKeyPhase(conditions);
    expect(result).toBe('Approved');
  });
});
