import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CeremonyAbortedError,
  SafeSdkError,
  UnsupportedEnvironmentError,
} from '../errors.js';

// Mock @safe-global/protocol-kit so the tests don't try to talk to a real
// RPC. Each test gets a clean set of mocks via vi.resetModules() below.
vi.mock('@safe-global/protocol-kit', () => {
  return {
    extractPasskeyData: vi.fn(async (credential: { id: string }) => ({
      rawId: 'raw-' + credential.id,
      coordinates: { x: '0xX', y: '0xY' },
    })),
    getP256VerifierAddress: vi.fn(
      (chainId: string) => '0xverifier' + chainId.padStart(40 - 9, '0'),
    ),
    SafeProvider: {
      init: vi.fn(async () => ({
        getExternalSigner: async () => ({
          account: { address: '0xowner000000000000000000000000000000000000' },
        }),
      })),
    },
    default: { init: vi.fn() }, // Safe (default) — unused in register
  };
});

const credentialId = 'cred-test';

function installFakeWebAuthn(returnCredential: { id: string } | null = { id: credentialId }) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(window, 'PublicKeyCredential', { value: function () {}, configurable: true });
  Object.defineProperty(navigator, 'credentials', {
    value: {
      create: vi.fn(async () => returnCredential),
    },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerPasskey environment guards', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  });

  it('throws UnsupportedEnvironmentError when not in a secure context', async () => {
    const { registerPasskey } = await import('./register.js');
    await expect(
      registerPasskey({
        rpId: 'localhost',
        rpName: 'test',
        userIdentifier: 'u1',
        chainId: 137,
        rpcUrl: 'https://rpc.test',
      }),
    ).rejects.toBeInstanceOf(UnsupportedEnvironmentError);
  });
});

describe('registerPasskey happy path', () => {
  beforeEach(() => {
    installFakeWebAuthn();
  });

  it('returns the Safe-derived owner address + credential id + metadata', async () => {
    const { registerPasskey } = await import('./register.js');
    const result = await registerPasskey({
      rpId: 'admin.example.com',
      rpName: 'Acme',
      userIdentifier: 'u1',
      chainId: 137,
      rpcUrl: 'https://rpc.test',
    });

    expect(result.address).toBe('0xowner000000000000000000000000000000000000');
    expect(result.credentialId).toBe(credentialId);
    expect(result.metadata).toMatchObject({
      credentialId,
      rawId: 'raw-' + credentialId,
      coordinates: { x: '0xX', y: '0xY' },
      chainId: 137,
      rpcUrl: 'https://rpc.test',
      rpId: 'admin.example.com',
      rpName: 'Acme',
      safeVersion: '1.4.1',
    });
    expect(result.metadata.passkey.verifierAddress).toEqual(expect.stringContaining('0xverifier'));
    expect(typeof result.metadata.createdAt).toBe('string');
  });

  it('coerces numeric chainId to string for getP256VerifierAddress', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    const { registerPasskey } = await import('./register.js');
    await registerPasskey({
      rpId: 'admin.example.com',
      rpName: 'Acme',
      userIdentifier: 'u1',
      chainId: 8453,
      rpcUrl: 'https://rpc.test',
    });
    expect(protocolKit.getP256VerifierAddress).toHaveBeenCalledWith('8453');
  });
});

describe('registerPasskey ceremony failure modes', () => {
  beforeEach(() => {
    installFakeWebAuthn(null);
  });

  it('maps a null credential to CeremonyAbortedError', async () => {
    const { registerPasskey } = await import('./register.js');
    await expect(
      registerPasskey({
        rpId: 'admin.example.com',
        rpName: 'Acme',
        userIdentifier: 'u1',
        chainId: 137,
        rpcUrl: 'https://rpc.test',
      }),
    ).rejects.toBeInstanceOf(CeremonyAbortedError);
  });
});

describe('registerPasskey Safe SDK derivation failure', () => {
  beforeEach(async () => {
    installFakeWebAuthn();
    const protocolKit = await import('@safe-global/protocol-kit');
    vi.mocked(protocolKit.SafeProvider.init).mockResolvedValueOnce({
      // Returns no account — should bubble as SafeSdkError.
      getExternalSigner: async () => ({ account: undefined }),
    } as never);
  });

  it('maps a missing owner address to SafeSdkError', async () => {
    const { registerPasskey } = await import('./register.js');
    await expect(
      registerPasskey({
        rpId: 'admin.example.com',
        rpName: 'Acme',
        userIdentifier: 'u1',
        chainId: 137,
        rpcUrl: 'https://rpc.test',
      }),
    ).rejects.toBeInstanceOf(SafeSdkError);
  });
});
