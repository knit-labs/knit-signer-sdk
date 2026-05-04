import { Buffer } from 'buffer';
import {
  CryptoKeypath,
  DataItem,
  PathComponent,
  RegistryItem,
  RegistryType,
  extend,
} from '@keystonehq/bc-ur-registry';
import type { DataItemMap } from '@keystonehq/bc-ur-registry';
import { URDecoder } from '@ngraveio/bc-ur';
import { hashMessage, recoverAddress } from 'viem';
import { QrSigningError, SafeSdkError, SignerAddressMismatchError } from '../errors.js';
import type { EoaSignature, Hex } from './types.js';

const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0";
const DEFAULT_SOURCE_FINGERPRINT = '00000000';
const ETH_SIGN_REQUEST_TYPE = 'eth-sign-request';
const ETH_SIGNATURE_TYPE = 'eth-signature';
const ETH_SIGN_REQUEST_REGISTRY_TYPE = new RegistryType(ETH_SIGN_REQUEST_TYPE, 401);
const ETH_SIGNATURE_REGISTRY_TYPE = new RegistryType(ETH_SIGNATURE_TYPE, 402);
const { RegistryTypes, decodeToDataItem } = extend;

extend.cbor.patchTags([401, 402]);

enum EthSignRequestKey {
  requestId = 1,
  signData,
  dataType,
  chainId,
  derivationPath,
  address,
  origin,
}

enum EthSignatureKey {
  requestId = 1,
  signature,
  origin,
}

enum EthSignDataType {
  personalMessage = 3,
}

export interface EoaQrSigningRequestOptions {
  /** Smart wallet / vault address being signed for. Kept for caller context. */
  readonly walletAddress?: string;
  /** Transaction hash returned by Knit/vault-core for the pending operation. */
  readonly transactionHash: Hex;
  /** Registered EOA signer expected to produce the QR response signature. */
  readonly expectedSignerAddress: string;
  /** EVM chain id shown to the offline signer. */
  readonly chainId: number;
  /**
   * Hardware-wallet derivation path. Defaults to the first Ethereum account;
   * pass the real path for best Keystone/air-gapped wallet compatibility.
   */
  readonly derivationPath?: string;
  /**
   * BIP32 source fingerprint as 4 bytes of hex. Defaults to 00000000 when
   * the app only knows the signer address.
   */
  readonly sourceFingerprint?: string;
  /** Stable id for matching the signature QR back to this request. */
  readonly requestId?: string;
  /** Optional origin label shown by compatible QR wallets. */
  readonly origin?: string;
  /** Max UR fragment size for animated QR frames. Defaults to the encoder default. */
  readonly maxFragmentLength?: number;
}

export interface EoaQrSigningRequest {
  readonly type: typeof ETH_SIGN_REQUEST_TYPE;
  readonly requestId: string;
  readonly frames: readonly string[];
  readonly transactionHash: Hex;
  readonly expectedSignerAddress: string;
  readonly walletAddress?: string;
}

export interface EoaQrSignaturePayload {
  readonly type: typeof ETH_SIGNATURE_TYPE;
  readonly requestId?: string;
  readonly signature: Hex;
  readonly origin?: string;
}

export interface VerifyEoaQrSignatureOptions {
  readonly request: Pick<
    EoaQrSigningRequest,
    'requestId' | 'transactionHash' | 'expectedSignerAddress'
  >;
  readonly response: string | readonly string[] | EoaQrSignaturePayload;
}

export class EoaQrSignatureDecoder {
  readonly #decoder = new URDecoder();

  receivePart(part: string): boolean {
    return this.#decoder.receivePart(part);
  }

  isComplete(): boolean {
    return this.#decoder.isComplete();
  }

  decode(): EoaQrSignaturePayload {
    if (!this.#decoder.isSuccess()) {
      throw new QrSigningError('EOA QR signature is incomplete or invalid.');
    }

    return decodeSignatureUr(this.#decoder.resultUR());
  }
}

export function createEoaQrSignRequest(
  options: EoaQrSigningRequestOptions,
): EoaQrSigningRequest {
  validateHash(options.transactionHash, 'transactionHash');
  validateAddress(options.expectedSignerAddress, 'expectedSignerAddress');

  if (options.walletAddress !== undefined) {
    validateAddress(options.walletAddress, 'walletAddress');
  }

  const sourceFingerprint = options.sourceFingerprint ?? DEFAULT_SOURCE_FINGERPRINT;
  if (!/^[a-fA-F0-9]{8}$/.test(sourceFingerprint)) {
    throw new SafeSdkError('sourceFingerprint must be 4 bytes of hex.');
  }

  const requestId = options.requestId ?? randomUuid();
  const request = new EthQrSignRequest({
    requestId: uuidToBuffer(requestId),
    signData: hexToBuffer(options.transactionHash),
    chainId: options.chainId,
    derivationPath: keypathFromString(
      options.derivationPath ?? DEFAULT_DERIVATION_PATH,
      sourceFingerprint,
    ),
    address: hexToBuffer(options.expectedSignerAddress),
    origin: options.origin,
  });

  const encoder = request.toUREncoder(options.maxFragmentLength);

  return {
    type: ETH_SIGN_REQUEST_TYPE,
    requestId,
    frames: encoder.encodeWhole(),
    transactionHash: options.transactionHash,
    expectedSignerAddress: options.expectedSignerAddress,
    walletAddress: options.walletAddress,
  };
}

export function decodeEoaQrSignature(
  response: string | readonly string[],
): EoaQrSignaturePayload {
  const frames = typeof response === 'string' ? [response] : response;
  const decoder = new EoaQrSignatureDecoder();

  for (const frame of frames) {
    decoder.receivePart(frame);
  }

  return decoder.decode();
}

export async function verifyEoaQrSignature(
  options: VerifyEoaQrSignatureOptions,
): Promise<EoaSignature> {
  const payload =
    typeof options.response === 'string' || isFrameList(options.response)
      ? decodeEoaQrSignature(options.response)
      : options.response;

  if (payload.requestId !== undefined && payload.requestId !== options.request.requestId) {
    throw new QrSigningError('EOA QR signature request id does not match the signing request.');
  }

  const signature = await normalizeSafeEoaSignature(
    payload.signature,
    options.request.transactionHash,
    options.request.expectedSignerAddress,
  );

  return {
    signature,
    signerAddress: options.request.expectedSignerAddress,
  };
}

function decodeSignatureUr(ur: { readonly type: string; readonly cbor: Buffer }): EoaQrSignaturePayload {
  if (ur.type !== ETH_SIGNATURE_TYPE) {
    throw new QrSigningError(`Expected ${ETH_SIGNATURE_TYPE} QR payload, received ${ur.type}.`);
  }

  let signature: EthQrSignature;
  try {
    signature = EthQrSignature.fromCBOR(ur.cbor);
  } catch (cause) {
    throw new QrSigningError('Unable to decode EOA QR signature payload.', {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  const signatureHex = bufferToHex(bytesFromUnknown(signature.getSignature()));
  if (!/^0x[a-fA-F0-9]{130}$/.test(signatureHex)) {
    throw new QrSigningError('EOA QR signature must be a 65-byte 0x-prefixed hex string.');
  }

  const requestId = signature.getRequestId();

  return {
    type: ETH_SIGNATURE_TYPE,
    requestId: requestId ? uuidFromBuffer(bytesFromUnknown(requestId)) : undefined,
    signature: signatureHex,
    origin: signature.getOrigin(),
  };
}

async function normalizeSafeEoaSignature(
  signature: Hex,
  transactionHash: Hex,
  expectedSignerAddress: string,
): Promise<Hex> {
  validateHash(transactionHash, 'transactionHash');
  validateAddress(expectedSignerAddress, 'expectedSignerAddress');

  const rawSignature = normalizeRecoveryId(signature);
  const rawRecovered = await recoverSigner(transactionHash, rawSignature);
  if (sameAddress(rawRecovered, expectedSignerAddress)) {
    return rawSignature;
  }

  const prefixedHash = hashMessage({ raw: transactionHash });
  const prefixedRecovered = await recoverSigner(prefixedHash, rawSignature);
  if (sameAddress(prefixedRecovered, expectedSignerAddress)) {
    return bumpSafePrefixedRecoveryId(rawSignature);
  }

  throw new SignerAddressMismatchError(
    `EOA QR signature was not produced by expected signer ${expectedSignerAddress}.`,
  );
}

async function recoverSigner(hash: Hex, signature: Hex): Promise<string | undefined> {
  try {
    return await recoverAddress({ hash, signature });
  } catch {
    return undefined;
  }
}

function normalizeRecoveryId(signature: Hex): Hex {
  const recoveryId = parseInt(signature.slice(-2), 16);
  if (![0, 1, 27, 28, 31, 32].includes(recoveryId)) {
    throw new QrSigningError('EOA QR signature has an invalid recovery id.');
  }

  if (recoveryId === 0 || recoveryId === 1) {
    return `${signature.slice(0, -2)}${(recoveryId + 27).toString(16).padStart(2, '0')}` as Hex;
  }

  return signature;
}

function bumpSafePrefixedRecoveryId(signature: Hex): Hex {
  const recoveryId = parseInt(signature.slice(-2), 16);
  if (recoveryId === 31 || recoveryId === 32) {
    return signature;
  }

  return `${signature.slice(0, -2)}${(recoveryId + 4).toString(16).padStart(2, '0')}` as Hex;
}

function randomUuid(): string {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new QrSigningError('Unable to generate EOA QR request id without Web Crypto.');
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;

  return uuidFromBuffer(Buffer.from(bytes));
}

function uuidFromBuffer(buffer: Buffer): string {
  const hex = buffer.toString('hex');
  if (!/^[a-fA-F0-9]{32}$/.test(hex)) {
    throw new QrSigningError('EOA QR request id must be a UUID.');
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function uuidToBuffer(uuid: string): Buffer {
  const hex = uuid.replaceAll('-', '');
  if (!/^[a-fA-F0-9]{32}$/.test(hex)) {
    throw new SafeSdkError('requestId must be a UUID.');
  }

  return Buffer.from(hex, 'hex');
}

function keypathFromString(path: string, sourceFingerprint: string): CryptoKeypath {
  const components = path
    .replace(/^[mM]\//, '')
    .split('/')
    .filter((component) => component.length > 0)
    .map((component) => {
      const hardened = component.endsWith("'");
      const index = Number.parseInt(component.replace("'", ''), 10);
      if (!Number.isInteger(index) || index < 0) {
        throw new SafeSdkError('derivationPath contains an invalid path component.');
      }

      return new PathComponent({ index, hardened });
    });

  return new CryptoKeypath(components, Buffer.from(sourceFingerprint, 'hex'));
}

function hexToBuffer(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function bufferToHex(value: Buffer): Hex {
  return `0x${value.toString('hex')}`;
}

function bytesFromUnknown(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value)) {
    return Buffer.from(value);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'Buffer' &&
    'data' in value
  ) {
    return bytesFromUnknown(value.data);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'getData' in value &&
    typeof value.getData === 'function'
  ) {
    return bytesFromUnknown(value.getData());
  }

  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
      return Buffer.from(keys.map((key) => Number((value as Record<string, unknown>)[key])));
    }
  }

  throw new QrSigningError('EOA QR payload contained an invalid byte field.');
}

function isFrameList(value: string | readonly string[] | EoaQrSignaturePayload): value is readonly string[] {
  return Array.isArray(value);
}

function validateHash(value: string, field: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new SafeSdkError(`${field} must be a 32-byte 0x-prefixed hex string.`);
  }
}

function validateAddress(value: string, field: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new SafeSdkError(`${field} must be a 20-byte 0x-prefixed hex address.`);
  }
}

function sameAddress(a: string | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase();
}

class EthQrSignRequest extends RegistryItem {
  readonly #requestId: Buffer;
  readonly #signData: Buffer;
  readonly #chainId: number;
  readonly #derivationPath: CryptoKeypath;
  readonly #address: Buffer;
  readonly #origin?: string;

  constructor(args: {
    readonly requestId: Buffer;
    readonly signData: Buffer;
    readonly chainId: number;
    readonly derivationPath: CryptoKeypath;
    readonly address: Buffer;
    readonly origin?: string;
  }) {
    super();
    this.#requestId = args.requestId;
    this.#signData = args.signData;
    this.#chainId = args.chainId;
    this.#derivationPath = args.derivationPath;
    this.#address = args.address;
    this.#origin = args.origin;
  }

  getRegistryType = (): RegistryType => ETH_SIGN_REQUEST_REGISTRY_TYPE;

  toDataItem = (): DataItem => {
    const map: DataItemMap = {};
    map[EthSignRequestKey.requestId] = new DataItem(
      this.#requestId,
      RegistryTypes.UUID.getTag(),
    );
    map[EthSignRequestKey.signData] = this.#signData;
    map[EthSignRequestKey.dataType] = EthSignDataType.personalMessage;
    map[EthSignRequestKey.chainId] = this.#chainId;
    map[EthSignRequestKey.address] = this.#address;

    const keypath = this.#derivationPath.toDataItem();
    keypath.setTag(this.#derivationPath.getRegistryType().getTag());
    map[EthSignRequestKey.derivationPath] = keypath;

    if (this.#origin !== undefined) {
      map[EthSignRequestKey.origin] = this.#origin;
    }

    return new DataItem(map);
  };
}

class EthQrSignature extends RegistryItem {
  readonly #signature: Buffer;
  readonly #requestId?: Buffer;
  readonly #origin?: string;

  constructor(signature: Buffer, requestId?: Buffer, origin?: string) {
    super();
    this.#signature = signature;
    this.#requestId = requestId;
    this.#origin = origin;
  }

  getRegistryType = (): RegistryType => ETH_SIGNATURE_REGISTRY_TYPE;

  getSignature = (): Buffer => this.#signature;
  getRequestId = (): Buffer | undefined => this.#requestId;
  getOrigin = (): string | undefined => this.#origin;

  toDataItem = (): DataItem => {
    const map: DataItemMap = {};
    if (this.#requestId !== undefined) {
      map[EthSignatureKey.requestId] = new DataItem(
        this.#requestId,
        RegistryTypes.UUID.getTag(),
      );
    }

    map[EthSignatureKey.signature] = this.#signature;

    if (this.#origin !== undefined) {
      map[EthSignatureKey.origin] = this.#origin;
    }

    return new DataItem(map);
  };

  static fromCBOR(cborPayload: Buffer): EthQrSignature {
    const map = decodeToDataItem(cborPayload).getData() as Record<number, unknown>;
    return new EthQrSignature(
      bytesFromUnknown(map[EthSignatureKey.signature]),
      map[EthSignatureKey.requestId] !== undefined
        ? bytesFromUnknown(
            typeof map[EthSignatureKey.requestId] === 'object' &&
              map[EthSignatureKey.requestId] !== null &&
              'getData' in map[EthSignatureKey.requestId] &&
              typeof map[EthSignatureKey.requestId].getData === 'function'
              ? map[EthSignatureKey.requestId].getData()
              : map[EthSignatureKey.requestId],
          )
        : undefined,
      typeof map[EthSignatureKey.origin] === 'string' ? map[EthSignatureKey.origin] : undefined,
    );
  }
}
