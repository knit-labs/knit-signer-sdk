import type { SafeVersion } from '@safe-global/types-kit';

/**
 * X/Y coordinates of the P-256 public key extracted from a WebAuthn
 * credential. Hex-encoded as Safe SDK returns them.
 */
export interface PasskeyCoordinates {
  readonly x: string;
  readonly y: string;
}

/**
 * The Safe-shaped passkey record — coordinates + the on-chain verifier
 * address. This is what `Safe.init({ signer })` expects.
 */
export interface PasskeyRecord {
  readonly rawId: string;
  readonly coordinates: PasskeyCoordinates;
  readonly verifierAddress: string;
}

/**
 * Opaque-to-callers blob persisted alongside a passkey registration. Hand
 * it back to {@link signWithPasskey} unchanged. The shape is stable within
 * a major SDK version.
 */
export interface PasskeyMetadata {
  readonly credentialId: string;
  readonly rawId: string;
  readonly coordinates: PasskeyCoordinates;
  readonly verifierAddress: string;
  readonly passkey: PasskeyRecord;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly safeVersion: SafeVersion;
  readonly rpId: string;
  readonly rpName: string;
  readonly createdAt: string;
}

export interface PasskeyRegistrationOptions {
  /** Relying-party ID. Must match the origin's hostname at sign time. */
  readonly rpId: string;
  /** Display name shown in the OS passkey UI. */
  readonly rpName: string;
  /** Stable per-user identifier baked into the credential's user handle. */
  readonly userIdentifier: string;
  /** EVM chain id of the Safe deployment that will own this passkey. */
  readonly chainId: number;
  /** RPC endpoint for the chain — Safe SDK uses it during owner derivation. */
  readonly rpcUrl: string;
  /** Default '1.4.1'. Override only if you know what you're doing. */
  readonly safeVersion?: SafeVersion;
  /** Default 60 seconds. */
  readonly timeoutMs?: number;
  /** Default 'preferred'. */
  readonly userVerification?: UserVerificationRequirement;
  /** Default 'preferred'. */
  readonly residentKey?: ResidentKeyRequirement;
}

export interface PasskeyRegistration {
  /** EIP-55 checksummed Safe owner address derived from the passkey. */
  readonly address: string;
  /** WebAuthn credential id (base64url). Stable for the lifetime of the key. */
  readonly credentialId: string;
  /** Persist this server-side; required for {@link signWithPasskey}. */
  readonly metadata: PasskeyMetadata;
}

export interface PasskeySigningOptions {
  readonly metadata: PasskeyMetadata;
  readonly safeAddress: string;
  readonly safeTxHash: string;
  /** All current Safe owner addresses (any order). */
  readonly owners: readonly string[];
  /** Defaults to metadata.safeVersion. */
  readonly safeVersion?: SafeVersion;
  /** Defaults to metadata.rpcUrl. */
  readonly rpcUrl?: string;
}

export interface PasskeySignature {
  /** 0x-prefixed contract-signature bytes. */
  readonly signature: string;
  /** EIP-55 checksummed signer address (matches PasskeyRegistration.address). */
  readonly signerAddress: string;
}
