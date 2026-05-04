export { registerPasskey } from './passkey/register.js';
export { signWithPasskey } from './passkey/sign.js';
export { signWithEoa } from './eoa/sign.js';
export {
  createEoaQrSignRequest,
  decodeEoaQrSignature,
  EoaQrSignatureDecoder,
  verifyEoaQrSignature,
} from './eoa/qr.js';
export type {
  EoaQrSignaturePayload,
  EoaQrSigningRequest,
  EoaQrSigningRequestOptions,
  VerifyEoaQrSignatureOptions,
} from './eoa/qr.js';
export type {
  PasskeyCoordinates,
  PasskeyMetadata,
  PasskeyRecord,
  PasskeyRegistration,
  PasskeyRegistrationOptions,
  PasskeySignature,
  PasskeySigningOptions,
} from './passkey/types.js';
export type {
  Eip1193Provider,
  EoaSignature,
  EoaSigningOptions,
  Hex,
} from './eoa/types.js';
export {
  CeremonyAbortedError,
  KnitSignerError,
  QrSigningError,
  SafeSdkError,
  SignerAddressMismatchError,
  UnsupportedEnvironmentError,
  WalletConnectionError,
} from './errors.js';
