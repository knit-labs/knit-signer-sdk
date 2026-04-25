/**
 * Base class for all errors thrown by the SDK. Lets consumers do a single
 * `instanceof KnitSignerError` check before drilling into specific kinds.
 */
export class KnitSignerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KnitSignerError';
  }
}

/**
 * The browser cannot perform the ceremony because WebAuthn or a secure
 * context is missing. Surface this to the user with a "this browser/scheme
 * isn't supported" message — there's nothing to retry.
 */
export class UnsupportedEnvironmentError extends KnitSignerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedEnvironmentError';
  }
}

/**
 * The user cancelled or the platform refused the WebAuthn prompt. Distinct
 * from environmental errors so callers can show a friendly retry button.
 */
export class CeremonyAbortedError extends KnitSignerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CeremonyAbortedError';
  }
}

/**
 * Safe SDK couldn't derive an owner address from the freshly-minted
 * passkey, or signing produced a result that doesn't match the expected
 * owner. Indicates a logic bug in the SDK or a Safe SDK version mismatch.
 */
export class SafeSdkError extends KnitSignerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SafeSdkError';
  }
}
