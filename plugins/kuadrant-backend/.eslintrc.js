const message =
  'Pulls in a few hundred packages this plugin never loads. See docs/ci.md#plugin-dependencies';

module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  restrictedImports: [
    { name: '@backstage/backend-defaults', message },
    { name: '@backstage/backend-test-utils', message },
  ],
});
