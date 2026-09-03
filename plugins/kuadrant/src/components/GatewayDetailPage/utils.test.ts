import { getGatewayOwner } from './utils';
import { GatewayManifest } from '../../types/mcp';

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
