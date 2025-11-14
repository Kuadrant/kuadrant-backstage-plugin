---
description: Run pre-PR validation checks for code quality, tests, and build
---

# PR Checklist for kuadrant-backstage-plugin

Run comprehensive pre-PR validation checks to ensure code quality before submitting a pull request. This command will verify:

- Linting passes
- Build succeeds
- TypeScript compilation is clean
- Code formatting is correct

**Note:** Run this command from the repository root directory.

---

## 1. Lint Check
Run linting to catch code quality issues:
```bash
yarn lint:check
```

## 2. Prettier Check
Verify code formatting:
```bash
yarn prettier:check
```

## 3. TypeScript Compilation
Check for TypeScript errors:
```bash
yarn tsc
```

## 4. Build All Packages
Ensure everything builds successfully:
```bash
yarn build
```

---

## Final Report

After running all checks, provide a summary report in this format:

```
PR CHECKLIST RESULTS
====================

✅ Lint Check:       PASSED / ❌ FAILED
✅ Prettier Check:   PASSED / ❌ FAILED
✅ TypeScript:       PASSED / ❌ FAILED
✅ Build:            PASSED / ❌ FAILED

OVERALL STATUS: READY FOR PR / NEEDS FIXES

---

Issues Found:
[List any specific errors or warnings that need attention]

Next Steps:
[If issues found, suggest fixes. If all passed, confirm ready for PR submission]
```

## Common Fixes

If checks fail, here are common remediation steps:

**Linting errors:**
```bash
yarn lint:fix
```

**Formatting errors:**
```bash
yarn prettier:fix
```

**Build failures:**
- Check for missing dependencies
- Verify TypeScript types are correct
- Check for circular dependencies
