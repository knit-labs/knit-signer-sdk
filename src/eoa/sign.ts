import Safe from '@safe-global/protocol-kit';
import {
  SafeSdkError,
  SignerAddressMismatchError,
  UnsupportedEnvironmentError,
  WalletConnectionError,
} from '../errors.js';
import type { Eip1193Provider, EoaSignature, EoaSigningOptions, Hex } from './types.js';

export async function signWithEoa(options: EoaSigningOptions): Promise<EoaSignature> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    throw new UnsupportedEnvironmentError(
      'EOA signing requires a secure browser context (HTTPS or localhost).',
    );
  }

  const walletAddress = options.walletAddress ?? options.safeAddress;
  const transactionHash = options.transactionHash ?? options.safeTxHash;

  if (walletAddress === undefined || walletAddress === '') {
    throw new SafeSdkError('walletAddress is required.');
  }
  if (transactionHash === undefined) {
    throw new SafeSdkError('transactionHash is required.');
  }

  validateAddress(walletAddress, 'walletAddress');
  validateHex(transactionHash, 'transactionHash');

  const signerAddress = await connectedSignerAddress(
    options.provider,
    options.requestAccounts ?? true,
  );

  if (
    options.expectedSignerAddress !== undefined &&
    !sameAddress(signerAddress, options.expectedSignerAddress)
  ) {
    throw new SignerAddressMismatchError(
      `Connected wallet ${signerAddress} does not match expected signer ${options.expectedSignerAddress}.`,
    );
  }

  let signed: { data?: string; signer?: string };
  try {
    const safe = await Safe.init({
      provider: options.provider,
      signer: signerAddress,
      safeAddress: walletAddress,
    });
    signed = await safe.signHash(transactionHash);
  } catch (cause) {
    throw new SafeSdkError('Safe SDK failed during EOA signing.', {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  const signature = signed?.data;
  if (typeof signature !== 'string' || !isHex(signature)) {
    throw new SafeSdkError(
      'Safe SDK did not return an EOA signature for the given transactionHash.',
    );
  }

  const returnedSigner = signed?.signer;
  if (typeof returnedSigner === 'string' && !sameAddress(returnedSigner, signerAddress)) {
    throw new SafeSdkError(
      `Safe SDK returned signer ${returnedSigner}, but wallet account is ${signerAddress}.`,
    );
  }

  return { signature: signature as Hex, signerAddress };
}

async function connectedSignerAddress(
  provider: Eip1193Provider,
  requestAccounts: boolean,
): Promise<string> {
  let accounts: unknown;

  try {
    accounts = requestAccounts
      ? await provider.request({ method: 'eth_requestAccounts' })
      : await provider.request({ method: 'eth_accounts' });
  } catch (cause) {
    throw new WalletConnectionError('Wallet connection was rejected or failed.', {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || !isAddress(first)) {
    throw new WalletConnectionError('Wallet did not expose a valid EOA account.');
  }

  return first;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function validateHex(value: string, field: string): void {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new SafeSdkError(`${field} must be a 32-byte 0x-prefixed hex string.`);
  }
}

function validateAddress(value: string, field: string): void {
  if (!isAddress(value)) {
    throw new SafeSdkError(`${field} must be a 20-byte 0x-prefixed hex address.`);
  }
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHex(value: string): boolean {
  return /^0x[a-fA-F0-9]+$/.test(value);
}
