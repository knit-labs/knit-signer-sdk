import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SafeSdkError,
  SignerAddressMismatchError,
  UnsupportedEnvironmentError,
  WalletConnectionError,
} from '../errors.js';
import type { Eip1193Provider, Hex } from './types.js';

vi.mock('@safe-global/protocol-kit', () => ({
  default: {
    init: vi.fn(async () => ({
      signHash: vi.fn(async (txHash: string) => ({
        data: '0x' + 'a'.repeat(128) + '1b',
        signer: '0x1111111111111111111111111111111111111111',
      })),
    })),
  },
}));

function provider(accounts: readonly string[]): Eip1193Provider {
  return {
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return [...accounts];
      }

      return null;
    }),
  };
}

function walletConnectProvider(accounts: readonly string[]): Eip1193Provider {
  return provider(accounts);
}

const WALLET_ADDRESS = '0x9999999999999999999999999999999999999999';
const SAFE_TX_HASH = ('0x' + 'b'.repeat(64)) as Hex;

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signWithEoa environment guards', () => {
  it('throws UnsupportedEnvironmentError when window is missing', async () => {
    const original = globalThis.window;
    // @ts-expect-error — deliberately removing window for the guard test.
    delete globalThis.window;
    try {
      const { signWithEoa } = await import('./sign.js');
      await expect(
        signWithEoa({
          provider: provider(['0x1111111111111111111111111111111111111111']),
          walletAddress: WALLET_ADDRESS,
          transactionHash: SAFE_TX_HASH,
        }),
      ).rejects.toBeInstanceOf(UnsupportedEnvironmentError);
    } finally {
      globalThis.window = original;
    }
  });

  it('throws UnsupportedEnvironmentError when not secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const { signWithEoa } = await import('./sign.js');
    await expect(
      signWithEoa({
        provider: provider(['0x1111111111111111111111111111111111111111']),
        walletAddress: WALLET_ADDRESS,
        transactionHash: SAFE_TX_HASH,
      }),
    ).rejects.toBeInstanceOf(UnsupportedEnvironmentError);
  });
});

describe('signWithEoa happy path', () => {
  it('signs with an injected EIP-1193 provider', async () => {
    const wallet = provider(['0x1111111111111111111111111111111111111111']);
    const { signWithEoa } = await import('./sign.js');

    const result = await signWithEoa({
      provider: wallet,
      walletAddress: WALLET_ADDRESS,
      transactionHash: '0xabcdef0000000000000000000000000000000000000000000000000000000000',
      expectedSignerAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(wallet.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(result.signature).toBe('0x' + 'a'.repeat(128) + '1b');
    expect(result.signerAddress).toBe('0x1111111111111111111111111111111111111111');
  });

  it('signs with a WalletConnect-style EIP-1193 provider', async () => {
    const wallet = walletConnectProvider(['0x1111111111111111111111111111111111111111']);
    const { signWithEoa } = await import('./sign.js');

    const result = await signWithEoa({
      provider: wallet,
      walletAddress: WALLET_ADDRESS,
      transactionHash: SAFE_TX_HASH,
      expectedSignerAddress: '0x1111111111111111111111111111111111111111',
    });

    expect(wallet.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(result.signature).toBe('0x' + 'a'.repeat(128) + '1b');
  });

  it('can use existing accounts without requesting a connection', async () => {
    const wallet = provider(['0x1111111111111111111111111111111111111111']);
    const { signWithEoa } = await import('./sign.js');

    await signWithEoa({
      provider: wallet,
      walletAddress: WALLET_ADDRESS,
      transactionHash: SAFE_TX_HASH,
      requestAccounts: false,
    });

    expect(wallet.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
  });

  it('keeps deprecated Safe field aliases working', async () => {
    const wallet = provider(['0x1111111111111111111111111111111111111111']);
    const { signWithEoa } = await import('./sign.js');

    const result = await signWithEoa({
      provider: wallet,
      safeAddress: WALLET_ADDRESS,
      safeTxHash: SAFE_TX_HASH,
    });

    expect(result.signature).toBe('0x' + 'a'.repeat(128) + '1b');
  });
});

describe('signWithEoa failure modes', () => {
  it('rejects when the connected account does not match the expected signer', async () => {
    const { signWithEoa } = await import('./sign.js');
    await expect(
      signWithEoa({
        provider: provider(['0x1111111111111111111111111111111111111111']),
        walletAddress: WALLET_ADDRESS,
        transactionHash: SAFE_TX_HASH,
        expectedSignerAddress: '0x2222222222222222222222222222222222222222',
      }),
    ).rejects.toBeInstanceOf(SignerAddressMismatchError);
  });

  it('rejects an invalid wallet address before initializing Safe SDK', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    vi.mocked(protocolKit.default.init).mockClear();
    const { signWithEoa } = await import('./sign.js');

    await expect(
      signWithEoa({
        provider: provider(['0x1111111111111111111111111111111111111111']),
        walletAddress: '0xsafe',
        transactionHash: SAFE_TX_HASH,
      }),
    ).rejects.toBeInstanceOf(SafeSdkError);

    expect(protocolKit.default.init).not.toHaveBeenCalled();
  });

  it('maps wallet connection failures to WalletConnectionError', async () => {
    const wallet: Eip1193Provider = {
      request: vi.fn(async () => {
        throw new Error('user rejected');
      }),
    };
    const { signWithEoa } = await import('./sign.js');

    await expect(
      signWithEoa({
        provider: wallet,
        walletAddress: WALLET_ADDRESS,
        transactionHash: SAFE_TX_HASH,
      }),
    ).rejects.toBeInstanceOf(WalletConnectionError);
  });

  it('maps Safe signing failures to SafeSdkError', async () => {
    const protocolKit = await import('@safe-global/protocol-kit');
    vi.mocked(protocolKit.default.init).mockRejectedValueOnce(new Error('rpc dead'));
    const { signWithEoa } = await import('./sign.js');

    await expect(
      signWithEoa({
        provider: provider(['0x1111111111111111111111111111111111111111']),
        walletAddress: WALLET_ADDRESS,
        transactionHash: SAFE_TX_HASH,
      }),
    ).rejects.toBeInstanceOf(SafeSdkError);
  });
});
