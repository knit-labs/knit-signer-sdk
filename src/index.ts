export { registerPasskey } from './passkey/register.js';
export { signWithPasskey } from './passkey/sign.js';
export type {
  PasskeyCoordinates,
  PasskeyMetadata,
  PasskeyRecord,
  PasskeyRegistration,
  PasskeyRegistrationOptions,
  PasskeySignature,
  PasskeySigningOptions,
} from './passkey/types.js';
export {
  CeremonyAbortedError,
  KnitSignerError,
  SafeSdkError,
  UnsupportedEnvironmentError,
} from './errors.js';
