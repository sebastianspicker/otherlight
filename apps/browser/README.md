# Otherlight Browser

The Browser is the primary Otherlight product. It is a Vite TypeScript modular
monolith with one runtime and explicit internal layers:

```text
domain <- application <- presentation <- composition
                  ^              \
                  |               infrastructure
```

`domain/` contains pure Education rules and simulation logic. `application/`
owns authoring and use cases. `infrastructure/` adapts workspace documents and
the loopback V5 service. `presentation/` owns DOM, controllers, rendering, and
styles. `composition/` wires startup.

The canonical authoring route is `SystemParams` to `EducationScenarioV4` to a
strict V5 request. See [../../docs/architecture.md](../../docs/architecture.md)
for contract and placement rules.

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm architecture:check
```

Education runs entirely in the Browser. Scientific-profile actions use only a
compatible local service on loopback and fail closed when capability is absent.
