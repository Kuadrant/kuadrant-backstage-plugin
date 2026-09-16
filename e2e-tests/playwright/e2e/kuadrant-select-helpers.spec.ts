import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test, expect } from "../fixtures/test";
import { selectFirstOption } from "../utils/kuadrant-helpers";

const require = createRequire(import.meta.url);

test.beforeAll(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "component", description: "plugins" });
});

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  // Use the app's MUI version so its actual menu exit transition is exercised.
  for (const [pkg, script] of [
    ["react", "umd/react.production.min.js"],
    ["react-dom", "umd/react-dom.production.min.js"],
    ["@material-ui/core", "umd/material-ui.production.min.js"],
  ]) {
    await page.addScriptTag({
      path: join(dirname(require.resolve(`${pkg}/package.json`)), script),
    });
  }
  await page.addScriptTag({
    content: `
      const { createElement: h, useState } = React;
      const { Dialog, Select, MenuItem, Button } = MaterialUI;
      function RequestForm() {
        const [api, setApi] = useState('');
        const [tier, setTier] = useState('');
        const menuProps = { transitionDuration: { enter: 0, exit: 500 } };
        return h(Dialog, { open: true },
          h(Select, {
            'data-testid': 'api-select', value: api, MenuProps: menuProps,
            onChange: event => { setApi(event.target.value); setTier(''); }
          }, h(MenuItem, { value: 'toystore-api' }, 'toystore-api')),
          h(Select, {
            'data-testid': 'tier-select', value: tier, disabled: !api,
            MenuProps: menuProps, onChange: event => setTier(event.target.value)
          }, h(MenuItem, { value: 'bronze' }, 'bronze')),
          h(Button, { disabled: !api || !tier }, 'Request')
        );
      }
      ReactDOM.createRoot(document.getElementById('root')).render(h(RequestForm));
    `,
  });
});

for (const apiName of [undefined, "toystore-api"]) {
  test(`selects ${apiName ?? "the first API"} then a tier while MUI menus animate closed`, async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog");
    await selectFirstOption(page, dialog, "api-select", apiName);
    await selectFirstOption(page, dialog, "tier-select");

    await expect(dialog.getByTestId("tier-select")).toHaveText("bronze");
    await expect(dialog.getByRole("button", { name: "Request" })).toBeEnabled();
  });
}
