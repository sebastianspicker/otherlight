# Security policy

## Reporting a vulnerability

Please use GitHub private vulnerability reporting from the repository's
**Security** tab when it is available, and include the affected revision,
reproduction steps, impact, and any proposed mitigation. Keep exploit details,
credentials, and personal data out of public issues.

If private reporting is unavailable, open a minimal issue asking for a private
contact channel without describing the problem itself. Ordinary, non-sensitive
bugs belong in the
[public issue tracker](https://github.com/sebastianspicker/otherlight/issues).

## What is in scope

The Browser is a static local application. Ordinary development and production
builds permit scientific requests only to `http://127.0.0.1:8765` and
`http://localhost:8765`; the GitHub Pages build removes those origins from its
Content Security Policy and performs no V5 execution. Its checked-in fixture
replay is display-only and is not a trusted runtime result.

The Python service is intended for one-host loopback use and has no
authentication, authorization, tenancy, or remote network trust model. Do not
bind it to a network interface without a separate authenticated deployment
design and security review. CORS is not an access-control mechanism.

The service validates strict V5 requests, applies bounded execution limits,
and writes content-addressed artifacts. Its V6 dataset boundary streams at
most 8 MiB before strict duplicate-safe JSON parsing, enforces dataset and
memory quotas, and retains imports only for the process lifetime. Treat request
bodies, imported workspaces, identifiers, and artifact paths as untrusted. Do
not weaken exact field, schema-version, identifier, URL, or path validation to
accept malformed data.

All service routes require a loopback `Host`; browser requests also require an
approved local `Origin`. Responses are non-cacheable and opt out of content
sniffing. Artifact reads use no-follow descriptor-relative opening and verify
file type, size, link count, and SHA-256 before serving the same descriptor.
These controls do not authenticate mutually hostile processes running as the
same local user. Non-loopback exposure still requires a separate authenticated
design.

`.otherlight` workspaces are local documents. They contain accepted scenario
and learning state, not credentials or computed artifacts. Readers reject
unknown versions and fields before mutating the active session.

The Apple app uses sandboxed, user-selected file access and has no runtime
network client. Its data-handling policy is in
[apps/apple/PRIVACY.md](apps/apple/PRIVACY.md).

## Dependency and disclosure checks

Use the checked-in lock and package metadata. When network access is available,
run:

```bash
pnpm audit --audit-level=moderate
```

CI also runs CodeQL and Gitleaks. A security fix should include focused
regression coverage where practical and preserve the loopback and strict-parsing
boundaries.
