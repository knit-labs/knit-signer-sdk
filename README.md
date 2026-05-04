# @useknit/signer-sdk

Browser-side helpers for registering and signing with Knit-managed
signers. Supports WebAuthn passkeys and EOA Safe signatures through
any EIP-1193 wallet provider, including injected wallets, wagmi connectors,
WalletConnect/Reown providers, and air-gapped QR wallets.

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
  rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
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

## Sign with an EOA wallet

For browser-injected wallets, pass the EIP-1193 provider directly:

```ts
import { signWithEoa } from '@useknit/signer-sdk';

const { signature, signerAddress } = await signWithEoa({
  provider: window.ethereum,
  walletAddress: '0x…',
  transactionHash: '0x…',
  expectedSignerAddress: registeredSignerAddress,
});

// POST `signature` and the selected signer id to your Knit custody service
// as an EOA/ECDSA user confirmation.
```

For WalletConnect/Reown, wagmi, or another wallet adapter, let the app create
or retrieve its provider and pass it through unchanged:

```ts
import { signWithEoa } from '@useknit/signer-sdk';

const provider = await walletConnector.getProvider();

const { signature } = await signWithEoa({
  provider,
  walletAddress: '0x…',
  transactionHash: '0x…',
  expectedSignerAddress: registeredSignerAddress,
});
```

`signWithEoa()` returns the Safe-compatible `r || s || v` EOA signature
shape expected by Knit confirmations; callers should not apply their own
`personal_sign` wrapping or `v` adjustment.

## Sign with an air-gapped QR wallet

For Keystone-style QR wallets, create an ERC-4527 `eth-sign-request`, render
the returned frames as an animated QR, scan the wallet's `eth-signature`
response, then verify it before submission:

```ts
import {
  createEoaQrSignRequest,
  verifyEoaQrSignature,
} from '@useknit/signer-sdk';

const request = createEoaQrSignRequest({
  walletAddress: '0x…',
  transactionHash: '0x…',
  expectedSignerAddress: registeredSignerAddress,
  chainId: 137,
  derivationPath: "m/44'/60'/0'/0/0",
  sourceFingerprint: 'f23f9fd2',
  origin: 'Knit signer',
});

renderAnimatedQr(request.frames);

const responseFrames = await scanSignatureQr();

const { signature, signerAddress } = await verifyEoaQrSignature({
  request,
  response: responseFrames,
});
```

The QR response verifier accepts both raw-hash ECDSA signatures and
personal-message QR signatures. Personal-message signatures are normalized
to Safe's expected `v + 4` form after recovering the registered signer
address.

## Errors

Every error inherits from `KnitSignerError`, so a single `instanceof`
check catches anything the SDK throws. Specific subclasses:

- `UnsupportedEnvironmentError` — browser doesn't support WebAuthn or
  the page isn't a secure context. Nothing to retry.
- `CeremonyAbortedError` — the user cancelled the platform prompt.
  Retry-friendly.
- `WalletConnectionError` — the EOA wallet session could not be opened or
  no account was exposed.
- `QrSigningError` — the air-gapped QR payload was incomplete, malformed, or
  did not match the signing request.
- `SignerAddressMismatchError` — the connected wallet is not the signer
  address expected by your application.
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
