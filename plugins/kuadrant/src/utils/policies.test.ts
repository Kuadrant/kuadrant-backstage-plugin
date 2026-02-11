import { getPolicyForRoute } from './policies';

describe('getPolicyForRoute', () => {
  describe('null and undefined policies', () => {
    it('should return null when policies array is null', () => {
      const result = getPolicyForRoute(null as any, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should return null when policies array is undefined', () => {
      const result = getPolicyForRoute(undefined as any, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should return null when no policies match', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-x',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });
  });

  describe('policy without targetRef.namespace (defaults to policy namespace)', () => {
    it('should match when policy in namespace A targets route R in same namespace A', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              // namespace not specified - should default to policy's namespace
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeDefined();
      expect(result.metadata.name).toBe('policy-1');
      expect(result.metadata.namespace).toBe('namespace-a');
    });

    it('should NOT match when policy in namespace A (without targetRef.namespace) is searched with route in namespace B', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              // namespace not specified - defaults to 'namespace-a'
            },
          },
        },
      ];

      // Searching for route-r in namespace-b should not match
      // because targetRef.namespace defaults to 'namespace-a'
      const result = getPolicyForRoute(policies, 'namespace-b', 'route-r');
      expect(result).toBeNull();
    });
  });

  describe('policy with explicit targetRef.namespace', () => {
    it('should match when policy in namespace A explicitly targets route R in namespace B', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-b', // explicitly set to namespace-b
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-b', 'route-r');
      expect(result).toBeDefined();
      expect(result.metadata.name).toBe('policy-1');
      expect(result.metadata.namespace).toBe('namespace-a');
      expect(result.spec.targetRef).toBeDefined();
      expect(result.spec.targetRef.namespace).toBe('namespace-b');
    });

    it('should NOT match when explicit namespace differs from search namespace', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-b',
            },
          },
        },
      ];

      // Searching in namespace-c should not match
      const result = getPolicyForRoute(policies, 'namespace-c', 'route-r');
      expect(result).toBeNull();
    });
  });

  describe('targetRef kind filtering', () => {
    it('should NOT match when targetRef.kind is not HTTPRoute', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'Gateway', // Wrong kind
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should NOT match when targetRef.kind is undefined', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });
  });

  describe('targetRef name filtering', () => {
    it('should NOT match when targetRef.name differs', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-x', // Different route name
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should match exact route name', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeDefined();
      expect(result.spec.targetRef.name).toBe('route-r');
    });
  });

  describe('multiple policies', () => {
    it('should return first matching policy when multiple policies match', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
        {
          metadata: {
            name: 'policy-2',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeDefined();
      expect(result.metadata.name).toBe('policy-1'); // First match
    });

    it('should find correct policy among multiple non-matching policies', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-wrong-name',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-x',
              namespace: 'namespace-a',
            },
          },
        },
        {
          metadata: {
            name: 'policy-wrong-kind',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'Gateway',
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
        {
          metadata: {
            name: 'policy-correct',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {
              kind: 'HTTPRoute',
              name: 'route-r',
              namespace: 'namespace-a',
            },
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeDefined();
      expect(result.metadata.name).toBe('policy-correct');
    });
  });

  describe('edge cases', () => {
    it('should handle empty policies array', () => {
      const result = getPolicyForRoute([], 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should handle policy without targetRef', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            // no targetRef
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });

    it('should handle policy with empty targetRef', () => {
      const policies = [
        {
          metadata: {
            name: 'policy-1',
            namespace: 'namespace-a',
          },
          spec: {
            targetRef: {},
          },
        },
      ];

      const result = getPolicyForRoute(policies, 'namespace-a', 'route-r');
      expect(result).toBeNull();
    });
  });
});
