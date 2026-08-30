# Security policy

## Reporting

Please report suspected vulnerabilities privately through the repository
security-advisory channel or the maintainer contact listed on the project
page. Include affected revision, reproduction steps, impact, and any proposed
mitigation. Do not publish a proof of concept containing personal data,
credentials, or active service targets.

## Supported boundaries

The Browser is a local static application. Its scientific integration is
restricted to `http://127.0.0.1:8765` and `http://localhost:8765` by its CSP.
The Python service is intended for loopback use only and has no authentication
or authorization model. Do not expose it on a network interface without a
separate authenticated deployment design and security review.

The service validates strict V5 requests, applies bounded execution limits,
and writes content-addressed artifacts. Treat all incoming payloads, imported
workspaces, and artifact paths as untrusted. Do not weaken exact-field,
identifier, or path validation to accept malformed data.

`.otherlight` workspaces are local documents. They hold accepted scenario and
learning state, not credentials or results. Parsers reject unknown schema
versions and unsupported fields.

The Apple app uses sandboxed user-selected file access. Its privacy policy is
at [apps/apple/PRIVACY.md](apps/apple/PRIVACY.md).

## Dependency and disclosure practice

Use the lockfile for Browser dependencies and the service package metadata for
Python dependencies. Run `pnpm audit --audit-level=moderate` when network
access is available. Security fixes should include a focused regression test
where practical and should preserve the documented loopback boundary.
