# kuadrant backstage plugins

this directory contains the source code for kuadrant backstage plugins:

- `plugins/kuadrant/` - frontend plugin
- `plugins/kuadrant-backend/` - backend plugin

## development

these plugins are developed as part of a backstage workspace but deployed as dynamic plugins to rhdh.

### building plugins

```bash
# from repo root
make build
```

### exporting as dynamic plugins

```bash
# from repo root
make export
```

this exports the plugins to `../rhdh-local/local-plugins/` for use with rhdh.

### full development workflow

see [../DEVELOPMENT.md](../DEVELOPMENT.md) for complete setup and workflow.

## structure

```
kuadrant-backstage/
├── plugins/
│   ├── kuadrant/              # frontend plugin source
│   └── kuadrant-backend/      # backend plugin source
├── CLAUDE.md                  # ai assistant research notes
├── package.json               # workspace config
├── tsconfig.json              # typescript config
└── yarn.lock                  # dependency lock
```

## notes

- this is a plugin-only workspace, not a full backstage application
- deployment uses rhdh with dynamic plugins (see rhdh-local submodule)
- legacy packages/app and packages/backend have been removed
