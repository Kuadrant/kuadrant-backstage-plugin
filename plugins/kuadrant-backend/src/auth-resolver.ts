import { createSignInResolverFactory } from '@backstage/plugin-auth-node';

// custom sign-in resolver that allows selecting user via query parameter
// usage: http://localhost:7008?user=alice
export const customUserResolver = createSignInResolverFactory({
  create() {
    return async (info, ctx) => {
      const { profile } = info;

      // check if user is specified in profile (from query param handled by frontend)
      const username = profile.email?.split('@')[0] || 'guest';

      // validate against allowed users
      const allowedUsers = ['alice', 'bob', 'guest'];
      const selectedUser = allowedUsers.includes(username) ? username : 'guest';

      const userEntityRef = `user:default/${selectedUser}`;

      return ctx.issueToken({
        claims: {
          sub: userEntityRef,
          ent: [userEntityRef],
        },
      });
    };
  },
});
