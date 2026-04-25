# Contributing to `@useknit/signer-sdk`

Thanks for your interest. The SDK is small and stable on purpose — most
changes belong in a tracked issue first.

## Development

```bash
npm install
npm test           # run vitest
npm run typecheck  # tsc --noEmit
npm run build      # emit dist/
```

## Branching

- `main` — released code. Do not push directly.
- `feat/*`, `fix/*` — work branches; open a PR against `main`.

CI runs `typecheck`, `test`, and `build` on every PR. PRs must be green
before merge.

## Releases

Releases are cut from `main` via a GitHub release; the `release` event
triggers the publish workflow which runs the full pipeline and publishes
to npm under the `@useknit` scope (public access).

Bump the version in `package.json` and add a `CHANGELOG.md` entry in the
PR that prepares the release. Tag the GitHub release with the matching
`vX.Y.Z`.

## Code style

- TypeScript strict mode. `noUncheckedIndexedAccess` is on.
- ESM-only output. Do not introduce CJS branches.
- Don't pull in heavy runtime deps. The whole point of this package is to
  be a thin wrapper around `@safe-global/protocol-kit`.
- Prefer small, well-typed value objects to ad-hoc records when adding
  new ceremonies.

## Reporting security issues

Don't open a public issue. Email `security@useknit.io` instead.
