import {
  formatAge,
  getGatewayOwner,
  hasCondition,
  isGatewayReady,
  GatewayManifest,
} from './utils';

describe('hasCondition', () => {
  it('returns true when a matching True condition exists', () => {
    expect(
      hasCondition([{ type: 'Accepted', status: 'True' }], 'Accepted'),
    ).toBe(true);
  });

  it('returns false when the condition is not True', () => {
    expect(
      hasCondition([{ type: 'Accepted', status: 'False' }], 'Accepted'),
    ).toBe(false);
  });

  it('returns false when conditions are undefined', () => {
    expect(hasCondition(undefined, 'Accepted')).toBe(false);
  });
});

describe('isGatewayReady', () => {
  it('is ready when Accepted and Programmed are both True', () => {
    const gateway: GatewayManifest = {
      status: {
        conditions: [
          { type: 'Accepted', status: 'True' },
          { type: 'Programmed', status: 'True' },
        ],
      },
    };
    expect(isGatewayReady(gateway)).toBe(true);
  });

  it('is not ready when only Accepted is True', () => {
    const gateway: GatewayManifest = {
      status: { conditions: [{ type: 'Accepted', status: 'True' }] },
    };
    expect(isGatewayReady(gateway)).toBe(false);
  });

  it('is not ready when there is no status', () => {
    expect(isGatewayReady({})).toBe(false);
    expect(isGatewayReady(undefined)).toBe(false);
  });
});

describe('formatAge', () => {
  const now = new Date('2026-08-20T12:00:00Z').getTime();

  it('returns days when older than a day', () => {
    expect(formatAge('2026-08-15T12:00:00Z', now)).toBe('5d');
  });

  it('returns hours when less than a day old', () => {
    expect(formatAge('2026-08-20T09:00:00Z', now)).toBe('3h');
  });

  it('returns minutes when less than an hour old', () => {
    expect(formatAge('2026-08-20T11:50:00Z', now)).toBe('10m');
  });

  it('returns seconds when less than a minute old', () => {
    expect(formatAge('2026-08-20T11:59:15Z', now)).toBe('45s');
  });

  it('returns - for missing or invalid timestamps', () => {
    expect(formatAge(undefined, now)).toBe('-');
    expect(formatAge('not-a-date', now)).toBe('-');
  });
});

describe('getGatewayOwner', () => {
  it('renders Kind/name from the first owner reference', () => {
    const gateway: GatewayManifest = {
      metadata: {
        ownerReferences: [{ kind: 'GatewayClass', name: 'istio' }],
      },
    };
    expect(getGatewayOwner(gateway)).toBe('GatewayClass/istio');
  });

  it('falls back to name when kind is missing', () => {
    const gateway: GatewayManifest = {
      metadata: { ownerReferences: [{ name: 'istio' }] },
    };
    expect(getGatewayOwner(gateway)).toBe('istio');
  });

  it('returns - when there is no owner reference', () => {
    expect(getGatewayOwner({})).toBe('-');
    expect(getGatewayOwner(undefined)).toBe('-');
  });
});
