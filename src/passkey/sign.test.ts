import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafeSdkError, UnsupportedEnvironmentError } from '../errors.js';
import type { PasskeyMetadata } from './types.js';

vi.mock('@safe-global/protocol-kit', () => ({
  default: {
    init: vi.fn(async () => ({
      signHash: vi.fn(async (txHash: string) => ({
        data: '0xsig' + txHash.slice(2, 8),
        signer: '0xsigner000000000000000000000000000000000000',
      })),
    })),
  },
  SafeProvider: { init: vi.fn() },
  extractPasskeyData: vi.fn(),
  getP256VerifierAddress: vi.fn(),
}));

const metadata: PasskeyMetadata = {
  credentialId: 'cred-1',
  rawId: 'raw-1',
  coordinates: { x: '0xX', y: '0xY' },
  verifierAddress: '0xverifier',
  passkey: {
    rawId: 'raw-1',
    coordinates: { x: '0xX', y: '0xY' },
    verifierAddress: '0xverifier',
  },
  chainId: 137,
  rpcUrl: 'https://rpc.test',
  safeVersion: '1.4.1',
  rpId: 'admin.example.com',
  rpName: 'Acme',
  createdAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signWithPasskey environment guards', () => {
  it('throws UnsupportedEnvironmentError when window is missing', async () => {
    const original = globalThis.window;
    // @ts-expect-error — deliberately removing window for the guard test.
    delete globalThis.window;
    try {
      const { signWithPasskey } = await import('./sign.js');
      await expect(
        signWithPasskey({
          metadata,
          safeAddress: '0xsafe',
          safeTxHash: '0xhash',
          owners: [],
        }),
      ).rejects.toBeInstanceOf(UnsupportedEnvironmentError);
    } finally {
      globalThis.window = original;
    }
  });

  it('throws UnsupportedEnvironmentError when not secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const { signWithPasskey } = await import('./sign.js');
    await expect(
      signWithPasskey({
        metadata,
        safeAddress: '0xsafe',
        safeTxHash: '0xhash',
        owners: [],
      }),
    ).rejects.toBeInstanceOf(UnsupportedEnvironmentError);
  });
});

describe('signWithPasskey happy path', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  it('returns the signature + signer address from Safe SDK', async () => {
    const { signWithPasskey } = await import('./sign.js');
    const result = await signWithPasskey({
      metadata,
      safeAddress: '0xsafeAddress',
      safeTxHash: '0xabcdef0000000000000000000000000000000000000000000000000000000000',
      owners: ['0xowner1', '0xowner2'],
    });
    expect(result.signature).toMatch(/^0xsig/);
    expect(result.signerAddress).toBe('0xsigner000000000000000000000000000000000000');
  });

  it('falls back to metadata.rpcUrl when not overridden', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    const { signWithPasskey } = await import('./sign.js');
    await signWithPasskey({
      metadata,
      safeAddress: '0xsafeAddress',
      safeTxHash: '0xabcdef00000000000000000000000000000000000000000000000000000000ff',
      owners: [],
    });
    expect(protocolKit.default.init).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'https://rpc.test' }),
    );
  });
});

describe('signWithPasskey failure modes', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  it('maps Safe.init throwing to SafeSdkError', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    vi.mocked(protocolKit.default.init).mockRejectedValueOnce(new Error('rpc dead'));
    const { signWithPasskey } = await import('./sign.js');
    await expect(
      signWithPasskey({
        metadata,
        safeAddress: '0xsafe',
        safeTxHash: '0xhash',
        owners: [],
      }),
    ).rejects.toBeInstanceOf(SafeSdkError);
  });

  it('maps a missing signature to SafeSdkError', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    vi.mocked(protocolKit.default.init).mockResolvedValueOnce({
      signHash: async () => ({ data: undefined, signer: '0xs' }),
    } as never);
    const { signWithPasskey } = await import('./sign.js');
    await expect(
      signWithPasskey({
        metadata,
        safeAddress: '0xsafe',
        safeTxHash: '0xhash',
        owners: [],
      }),
    ).rejects.toBeInstanceOf(SafeSdkError);
  });
});
