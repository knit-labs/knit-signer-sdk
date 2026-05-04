# Changelog

All notable changes to `@useknit/signer-sdk` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `signWithEoa(options)` — produces a Safe-compatible EOA `r || s || v`
  signature for a `transactionHash` using an EIP-1193 wallet provider. This
  works with injected wallets, wagmi connectors, and WalletConnect/Reown
  providers supplied by the consuming app.
- Air-gapped EOA QR signing helpers:
  `createEoaQrSignRequest(options)`, `decodeEoaQrSignature(response)`,
  `EoaQrSignatureDecoder`, and `verifyEoaQrSignature(options)`.
- EOA-specific errors: `WalletConnectionError` and
  `SignerAddressMismatchError`.
- QR-specific error: `QrSigningError`.

## [0.1.0] - 2026-04-26

Initial release.

### Added

- `registerPasskey(options)` — runs the full WebAuthn registration ceremony
  in the browser and returns the Safe-derived owner address, the credential
  id, and an opaque metadata blob the consumer must persist.
- `signWithPasskey(options)` — produces a Safe contract-signature for a
  given `safeTxHash` using a previously-registered passkey.
- Strongly-typed errors: `KnitSignerError` (base), `UnsupportedEnvironmentError`,
  `CeremonyAbortedError`, `SafeSdkError`.
- ESM-only build targeting ES2022 with shipped `.d.ts` declarations.
