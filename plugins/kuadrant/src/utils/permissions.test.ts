import { renderHook } from '@testing-library/react';
import { usePermission } from '@backstage/plugin-permission-react';
import { canDeleteResource, useKuadrantPermission } from './permissions';
import { Permission, ResourcePermission } from '@backstage/plugin-permission-common';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: jest.fn(),
}));

const mockUsePermission = usePermission as jest.MockedFunction<
  typeof usePermission
>;

describe('canDeleteResource', () => {
  describe('when user has canDeleteAll permission', () => {
    it('returns true even if user is not the owner', () => {
      expect(canDeleteResource('owner-1', 'user-2', false, true)).toBe(true);
    });

    it('returns true when user is also the owner', () => {
      expect(canDeleteResource('user-1', 'user-1', false, true)).toBe(true);
    });

    it('returns true regardless of canDeleteOwn flag', () => {
      expect(canDeleteResource('owner-1', 'user-2', true, true)).toBe(true);
    });
  });

  describe('when user has canDeleteOwn permission', () => {
    it('returns true when user is the owner', () => {
      expect(canDeleteResource('user-1', 'user-1', true, false)).toBe(true);
    });

    it('returns false when user is not the owner', () => {
      expect(canDeleteResource('owner-1', 'user-2', true, false)).toBe(false);
    });
  });

  describe('when user has no delete permissions', () => {
    it('returns false even if user is the owner', () => {
      expect(canDeleteResource('user-1', 'user-1', false, false)).toBe(false);
    });

    it('returns false when user is not the owner', () => {
      expect(canDeleteResource('owner-1', 'user-2', false, false)).toBe(false);
    });
  });
});

describe('useKuadrantPermission', () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
  });

  describe('with a basic permission (no resourceType)', () => {
    const basicPermission: Permission = {
      type: 'basic',
      name: 'kuadrant.apiproduct.list',
      attributes: {},
    };

    it('returns allowed true when permission is granted', () => {
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: true,
      });

      const { result } = renderHook(() =>
        useKuadrantPermission(basicPermission),
      );

      expect(result.current).toEqual({
        allowed: true,
        loading: false,
        error: undefined,
      });
    });

    it('passes permission without resourceRef to usePermission', () => {
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: false,
      });

      renderHook(() => useKuadrantPermission(basicPermission));

      expect(mockUsePermission).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: basicPermission,
        }),
      );
      // should not have resourceRef in the call
      const callArg = mockUsePermission.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('resourceRef');
    });

    it('returns loading true while permission check is in progress', () => {
      mockUsePermission.mockReturnValue({
        loading: true,
        allowed: false,
      });

      const { result } = renderHook(() =>
        useKuadrantPermission(basicPermission),
      );

      expect(result.current).toEqual({
        allowed: false,
        loading: true,
        error: undefined,
      });
    });

    it('returns error when permission check fails', () => {
      const error = new Error('Permission check failed');
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: false,
        error,
      });

      const { result } = renderHook(() =>
        useKuadrantPermission(basicPermission),
      );

      expect(result.current).toEqual({
        allowed: false,
        loading: false,
        error,
      });
    });
  });

  describe('with a resource permission (has resourceType)', () => {
    const resourcePermission = {
      type: 'resource',
      name: 'kuadrant.apikey.create',
      resourceType: 'kuadrant-apikey',
      attributes: {},
    } as ResourcePermission;

    it('passes permission with resourceRef to usePermission', () => {
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: true,
      });

      renderHook(() =>
        useKuadrantPermission(
          resourcePermission,
          'apiproduct:default/my-api',
        ),
      );

      expect(mockUsePermission).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: resourcePermission,
          resourceRef: 'apiproduct:default/my-api',
        }),
      );
    });

    it('returns allowed true when resource permission is granted', () => {
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: true,
      });

      const { result } = renderHook(() =>
        useKuadrantPermission(
          resourcePermission,
          'apiproduct:default/my-api',
        ),
      );

      expect(result.current).toEqual({
        allowed: true,
        loading: false,
        error: undefined,
      });
    });

    it('returns allowed false when resource permission is denied', () => {
      mockUsePermission.mockReturnValue({
        loading: false,
        allowed: false,
      });

      const { result } = renderHook(() =>
        useKuadrantPermission(
          resourcePermission,
          'apiproduct:default/my-api',
        ),
      );

      expect(result.current).toEqual({
        allowed: false,
        loading: false,
        error: undefined,
      });
    });
  });
});
