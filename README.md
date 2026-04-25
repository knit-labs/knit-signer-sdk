# @useknit/signer-sdk

Browser-side helpers for registering and signing with Knit-managed signers.
Today: WebAuthn passkeys backed by `@safe-global/protocol-kit`. Later: EOA
helpers, smart-contract wallet signers.

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
  chainId: 137,                          // Safe deployment chain
  rpcUrl: 'https://polygon-rpc.com',
});

// result.address is the EVM owner address derived from the passkey.
// result.credentialId is the WebAuthn credential id (base64url).
// result.metadata is the opaque blob you must persist alongside the row;
// you'll hand it back to signWithPasskey() later.
```

The browser handles the entire WebAuthn ceremony; the server never sees a
challenge. Persist `result.metadata` server-side (the SDK does NOT touch
storage) along with `address` and `credentialId`.

## Sign a Safe transaction with a registered passkey

```ts
import { signWithPasskey } from '@useknit/signer-sdk';

const { signature, signerAddress } = await signWithPasskey({
  metadata: storedMetadata,              // what you got from registerPasskey()
  safeAddress: '0x…',
  safeTxHash: '0x…',
  owners: ['0xowner1', '0xowner2', '0xowner3'],
  // safeVersion + rpcUrl optional; SDK falls back to metadata fields.
});
```

`signature` is the contract-signature blob; submit it to your custody
service as a `SAFE_WEBAUTHN_CONTRACT_SIGNATURE` confirmation.

## Why this lives in Knit and not the consumer app

A passkey enrolled at one origin can only sign there — the registration
ceremony is RP-scoped. Centralising the helpers here means every Knit
consumer gets the same `(register → sign)` shape and the same Safe SDK
version pin, so cross-team upgrades land in one place.

## Status

Pre-1.0. API may shift. Track the changelog before upgrading.
