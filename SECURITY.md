# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly through **private channels**.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub Security Advisories](https://github.com/HugoLopes45/polybot-ts/security/advisories/new) to report vulnerabilities privately. This ensures the issue can be addressed before public disclosure.

When reporting, please include:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact
4. Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

## Scope

This policy applies to the `@polybot/sdk` npm package and this repository. Third-party dependencies are out of scope, but we appreciate reports about vulnerable dependencies.

## Security Considerations

This SDK handles:
- **Private keys** for Ethereum/Polygon signing (via `lib/ethereum/`)
- **API credentials** for Polymarket CLOB access
- **Financial operations** (order placement, position management)

All credential objects are wrapped with opaque markers and auto-redacted from logs. Never store secrets in code, environment variables in version control, or unencrypted on disk.
