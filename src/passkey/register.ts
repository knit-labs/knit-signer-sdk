import {
  SafeProvider,
  extractPasskeyData,
  getP256VerifierAddress,
} from '@safe-global/protocol-kit';
import type { SafeVersion } from '@safe-global/types-kit';
import {
  CeremonyAbortedError,
  SafeSdkError,
  UnsupportedEnvironmentError,
} from '../errors.js';
import type {
  PasskeyMetadata,
  PasskeyRegistration,
  PasskeyRegistrationOptions,
} from './types.js';

const DEFAULT_SAFE_VERSION: SafeVersion = '1.4.1';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Run the full WebAuthn registration ceremony in the browser and derive
 * the Safe-compatible owner address from the resulting credential.
 *
 * The challenge is generated locally and never sent to a server — Safe's
 * model lets the client own the ceremony entirely. The returned
 * {@link PasskeyMetadata} is the only thing the caller needs to persist
 * to sign with this passkey later.
 */
export async function registerPasskey(
  options: PasskeyRegistrationOptions,
): Promise<PasskeyRegistration> {
  assertBrowserSupportsCeremony();

  const safeVersion = options.safeVersion ?? DEFAULT_SAFE_VERSION;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(32));

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: options.rpId, name: options.rpName },
        user: {
          id: userId,
          name: options.userIdentifier,
          displayName: options.userIdentifier,
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: timeoutMs,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: options.residentKey ?? 'preferred',
          userVerification: options.userVerification ?? 'preferred',
        },
      },
    })) as PublicKeyCredential | null;
  } catch (cause) {
    // The platform rejected or the user cancelled. WebAuthn surfaces both
    // as a generic error; we collapse them so callers can show one
    // "didn't complete" UX state.
    throw new CeremonyAbortedError(
      'Passkey creation was cancelled or refused by the platform.',
      { cause: cause instanceof Error ? cause : undefined },
    );
  }

  if (!credential) {
    throw new CeremonyAbortedError(
      'Passkey creation returned no credential. The user likely dismissed the prompt.',
    );
  }

  const extracted = await extractPasskeyData(credential);
  // Safe SDK takes the chainId as a string (decimal). Callers pass a number
  // because every other web3 lib does — convert at the boundary.
  const verifierAddress = getP256VerifierAddress(options.chainId.toString());
  const passkeySigner = { ...extracted, verifierAddress };

  let ownerAddress: string | undefined;
  try {
    const safeProvider = await SafeProvider.init({
      provider: options.rpcUrl,
      signer: passkeySigner,
      safeVersion,
      // Empty `owners` is intentional — we only need the provider to
      // surface the *external* signer's address; no Safe is being
      // deployed here.
      owners: [],
    });
    const externalSigner = await safeProvider.getExternalSigner();
    ownerAddress = externalSigner?.account?.address;
  } catch (cause) {
    throw new SafeSdkError(
      'Safe SDK failed during external-signer derivation.',
      { cause: cause instanceof Error ? cause : undefined },
    );
  }

  if (!ownerAddress) {
    throw new SafeSdkError(
      'Safe SDK did not return an owner address for the freshly-minted passkey.',
    );
  }

  const metadata: PasskeyMetadata = {
    credentialId: credential.id,
    rawId: extracted.rawId,
    coordinates: extracted.coordinates,
    verifierAddress,
    passkey: passkeySigner,
    chainId: options.chainId,
    rpcUrl: options.rpcUrl,
    safeVersion,
    rpId: options.rpId,
    rpName: options.rpName,
    createdAt: new Date().toISOString(),
  };

  return {
    address: ownerAddress,
    credentialId: credential.id,
    metadata,
  };
}

function assertBrowserSupportsCeremony(): void {
  if (typeof window === 'undefined') {
    throw new UnsupportedEnvironmentError(
      'registerPasskey() must be called from a browser context.',
    );
  }
  if (!window.isSecureContext) {
    throw new UnsupportedEnvironmentError(
      'WebAuthn requires a secure context (HTTPS or localhost).',
    );
  }
  if (
    typeof window.PublicKeyCredential === 'undefined' ||
    typeof navigator.credentials?.create !== 'function'
  ) {
    throw new UnsupportedEnvironmentError(
      'This browser does not support WebAuthn passkeys.',
    );
  }
}
