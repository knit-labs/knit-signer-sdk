import { Buffer } from 'buffer';
import {
  DataItem,
  RegistryItem,
  RegistryType,
  extend,
} from '@keystonehq/bc-ur-registry';
import type { DataItemMap } from '@keystonehq/bc-ur-registry';
import { URDecoder } from '@ngraveio/bc-ur';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { QrSigningError, SignerAddressMismatchError } from '../errors.js';
import type { Hex } from './types.js';
import {
  EoaQrSignatureDecoder,
  createEoaQrSignRequest,
  decodeEoaQrSignature,
  verifyEoaQrSignature,
} from './qr.js';

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const TRANSACTION_HASH = ('0x' + 'b'.repeat(64)) as Hex;
const WALLET_ADDRESS = '0x9999999999999999999999999999999999999999';
const PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ACCOUNT = privateKeyToAccount(PRIVATE_KEY);
const ETH_SIGNATURE_REGISTRY_TYPE = new RegistryType('eth-signature', 402);

extend.cbor.patchTags([401, 402]);

describe('createEoaQrSignRequest', () => {
  it('creates ERC-4527 eth-sign-request UR frames', () => {
    const request = createEoaQrSignRequest({
      walletAddress: WALLET_ADDRESS,
      transactionHash: TRANSACTION_HASH,
      expectedSignerAddress: ACCOUNT.address,
      chainId: 137,
      derivationPath: "m/44'/60'/0'/0/3",
      sourceFingerprint: 'f23f9fd2',
      requestId: REQUEST_ID,
      origin: 'Knit signer',
      maxFragmentLength: 80,
    });

    expect(request).toMatchObject({
      type: 'eth-sign-request',
      requestId: REQUEST_ID,
      transactionHash: TRANSACTION_HASH,
      expectedSignerAddress: ACCOUNT.address,
      walletAddress: WALLET_ADDRESS,
    });
    expect(request.frames.length).toBeGreaterThan(0);
    expect(request.frames[0]?.startsWith('ur:eth-sign-request/')).toBe(true);

    const decoder = new URDecoder();
    for (const frame of request.frames) {
      decoder.receivePart(frame);
    }

    const decoded = extend.decodeToDataItem(decoder.resultUR().cbor).getData() as Record<
      number,
      unknown
    >;
    const keypath = decoded[5] as { getData(): Record<number, unknown> };
    const keypathMap = keypath.getData();

    expect(bytesToBuffer(decoded[2]).toString('hex')).toBe(TRANSACTION_HASH.slice(2));
    expect(bytesToBuffer(decoded[6]).toString('hex')).toBe(
      ACCOUNT.address.slice(2).toLowerCase(),
    );
    expect(decoded[3]).toBe(3);
    expect(decoded[4]).toBe(137);
    expect(keypathMap[2]).toBe(0xf23f9fd2);
    expect(decoded[7]).toBe('Knit signer');
  });
});

describe('EOA QR signature decoding', () => {
  it('decodes animated eth-signature UR frames', async () => {
    const signature = await ACCOUNT.signMessage({ message: { raw: TRANSACTION_HASH } });
    const frames = signatureFrames(signature, REQUEST_ID, 30);
    const decoder = new EoaQrSignatureDecoder();

    for (const frame of frames) {
      decoder.receivePart(frame);
    }

    expect(decoder.isComplete()).toBe(true);
    expect(decoder.decode()).toEqual({
      type: 'eth-signature',
      requestId: REQUEST_ID,
      signature,
      origin: 'Keystone',
    });
  });

  it('rejects non-signature UR payloads', () => {
    const request = createEoaQrSignRequest({
      transactionHash: TRANSACTION_HASH,
      expectedSignerAddress: ACCOUNT.address,
      chainId: 137,
      requestId: REQUEST_ID,
    });

    expect(() => decodeEoaQrSignature(request.frames)).toThrow(QrSigningError);
  });
});

describe('verifyEoaQrSignature', () => {
  it('verifies and normalizes a QR personal-message signature for Safe EOA submission', async () => {
    const signature = await ACCOUNT.signMessage({ message: { raw: TRANSACTION_HASH } });
    const result = await verifyEoaQrSignature({
      request: {
        requestId: REQUEST_ID,
        transactionHash: TRANSACTION_HASH,
        expectedSignerAddress: ACCOUNT.address,
      },
      response: signatureFrames(signature, REQUEST_ID),
    });

    expect(result.signerAddress).toBe(ACCOUNT.address);
    expect(result.signature.slice(0, -2)).toBe(signature.slice(0, -2));
    expect(parseInt(result.signature.slice(-2), 16)).toBe(
      parseInt(signature.slice(-2), 16) + 4,
    );
  });

  it('rejects a mismatched request id', async () => {
    const signature = await ACCOUNT.signMessage({ message: { raw: TRANSACTION_HASH } });

    await expect(
      verifyEoaQrSignature({
        request: {
          requestId: REQUEST_ID,
          transactionHash: TRANSACTION_HASH,
          expectedSignerAddress: ACCOUNT.address,
        },
        response: signatureFrames(signature, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      }),
    ).rejects.toBeInstanceOf(QrSigningError);
  });

  it('rejects a signature from the wrong EOA', async () => {
    const signature = await ACCOUNT.signMessage({ message: { raw: TRANSACTION_HASH } });

    await expect(
      verifyEoaQrSignature({
        request: {
          requestId: REQUEST_ID,
          transactionHash: TRANSACTION_HASH,
          expectedSignerAddress: '0x2222222222222222222222222222222222222222',
        },
        response: signatureFrames(signature, REQUEST_ID),
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError);
  });
});

function signatureFrames(signature: Hex, requestId: string, maxFragmentLength?: number): readonly string[] {
  const payload = new TestEthSignature(Buffer.from(signature.slice(2), 'hex'), uuidToBuffer(requestId), 'Keystone');

  return payload.toUREncoder(maxFragmentLength).encodeWhole();
}

function uuidToBuffer(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

class TestEthSignature extends RegistryItem {
  constructor(
    readonly signature: Buffer,
    readonly requestId?: Buffer,
    readonly origin?: string,
  ) {
    super();
  }

  getRegistryType = (): RegistryType => ETH_SIGNATURE_REGISTRY_TYPE;

  toDataItem = (): DataItem => {
    const map: DataItemMap = {};
    map[2] = this.signature;
    if (this.requestId !== undefined) {
      map[1] = new DataItem(this.requestId, extend.RegistryTypes.UUID.getTag());
    }
    if (this.origin !== undefined) {
      map[3] = this.origin;
    }

    return new DataItem(map);
  };
}

function bytesToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'getData' in value &&
    typeof value.getData === 'function'
  ) {
    return bytesToBuffer(value.getData());
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'Buffer' &&
    'data' in value
  ) {
    return bytesToBuffer(value.data);
  }

  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
      return Buffer.from(keys.map((key) => Number((value as Record<string, unknown>)[key])));
    }
  }

  throw new Error('Invalid byte value');
}
