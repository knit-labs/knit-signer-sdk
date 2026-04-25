# @useknit/signer-sdk

Browser-side helpers for registering and signing with Knit-managed
signers. Today: WebAuthn passkeys. EOA helpers and additional ceremonies
will land in later versions.

## Install

```bash
npm install @useknit/signer-sdk
```

ESM-only. Requires a browser environment (uses `navigator.credentials`,
`window.crypto`, `window.localStorage`).

## Register a passkey

```ts
import { registerPasskey } from '@useknit/signer-sdk';

const result = await registerPasskey({
  rpId: window.location.hostname,        // must match origin at sign time
  rpName: 'Acme Custody',                // shown by the OS passkey UI
  userIdentifier: 'user:42',             // stable per user; not displayed
  chainId: 137,                          // chain the signer will be used on
  rpcUrl: 'https://polygon-rpc.com',
});

// Send `result.address`, `result.credentialId`, and `result.metadata`
// to your Knit custody service to enroll the signer. Persist
// `result.metadata` server-side — you'll hand it back unchanged at
// signing time.
```

The SDK runs the entire WebAuthn ceremony in the browser; your server
never sees a challenge. The returned `metadata` is opaque to your
application — treat it as a black box.

## Sign with a registered passkey

```ts
import { signWithPasskey } from '@useknit/signer-sdk';

const { signature, signerAddress } = await signWithPasskey({
  metadata: storedMetadata,              // what registerPasskey() returned
  safeAddress: '0x…',                    // wallet you're signing for
  safeTxHash: '0x…',                     // hash to sign
  owners: ['0xowner1', '0xowner2'],      // current wallet owners
});

// Hand `signature` to your Knit custody service as the user
// confirmation for the operation.
```

## Errors

Every error inherits from `KnitSignerError`, so a single `instanceof`
check catches anything the SDK throws. Specific subclasses:

- `UnsupportedEnvironmentError` — browser doesn't support WebAuthn or
  the page isn't a secure context. Nothing to retry.
- `CeremonyAbortedError` — the user cancelled the platform prompt.
  Retry-friendly.
- `SafeSdkError` — internal derivation/signing failed. Indicates a
  configuration mismatch (wrong `rpcUrl`, wrong `chainId`) or a bug.

```ts
import { CeremonyAbortedError, KnitSignerError } from '@useknit/signer-sdk';

try {
  await registerPasskey({ /* ... */ });
} catch (error) {
  if (error instanceof CeremonyAbortedError) {
    // show "try again" button
  } else if (error instanceof KnitSignerError) {
    // surface error.message
  }
}
```

## Why a SDK and not direct WebAuthn?

Two reasons. First, WebAuthn ergonomics — the raw `navigator.credentials`
API leaks plenty of footguns (challenge encoding, attestation parsing,
RP scoping). Second, the credential a user enrolls here has to interop
with Knit's on-chain custody contracts; that derivation is a moving
target we'd rather you not maintain.

This package wraps both layers so you write one call and get back what
you persist.

## Status

Pre-1.0. The API may shift on minor versions. Track `CHANGELOG.md`
before upgrading.

## License

MIT.
