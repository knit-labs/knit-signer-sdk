import Safe from '@safe-global/protocol-kit';
import { SafeSdkError, UnsupportedEnvironmentError } from '../errors.js';
import type { PasskeySignature, PasskeySigningOptions } from './types.js';

/**
 * Produce a Safe contract-signature for the given safeTxHash using a
 * previously-registered passkey. The caller hands back the
 * {@link PasskeyMetadata} that {@link registerPasskey} returned — this
 * function is otherwise stateless.
 *
 * Submit the result to your custody service as a
 * `SAFE_WEBAUTHN_CONTRACT_SIGNATURE` confirmation; do NOT treat it as a
 * regular EOA `r||s||v` signature.
 *
 * The `safeVersion` and `owners` fields are accepted on the input for
 * forward-compat and parity with the Knit custody-svc tester, but Safe
 * SDK reads both from the chain at `Safe.init` time — they're not handed
 * to the SDK.
 */
export async function signWithPasskey(
  options: PasskeySigningOptions,
): Promise<PasskeySignature> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    throw new UnsupportedEnvironmentError(
      'Passkey signing requires a secure browser context (HTTPS or localhost).',
    );
  }

  const rpcUrl = options.rpcUrl ?? options.metadata.rpcUrl;

  let signed: { data?: string; signer?: string };
  try {
    const safe = await Safe.init({
      provider: rpcUrl,
      signer: options.metadata.passkey,
      safeAddress: options.safeAddress,
    });
    signed = await safe.signHash(options.safeTxHash);
  } catch (cause) {
    throw new SafeSdkError('Safe SDK failed during passkey signing.', {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  const signature = signed?.data;
  const signerAddress = signed?.signer;

  if (!signature) {
    throw new SafeSdkError(
      'Safe SDK did not return a passkey signature for the given safeTxHash.',
    );
  }
  if (!signerAddress) {
    throw new SafeSdkError(
      'Safe SDK returned a signature with no signer address.',
    );
  }

  return { signature, signerAddress };
}
