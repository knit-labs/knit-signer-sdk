export type Hex = `0x${string}`;

export interface Eip1193Provider {
  request(args: {
    readonly method: string;
    readonly params?: readonly unknown[] | object;
  }): Promise<unknown>;
}

export interface EoaSigningOptions {
  /**
   * Any EIP-1193 wallet provider: window.ethereum, WalletConnect, or a
   * wagmi connector provider.
   */
  readonly provider: Eip1193Provider;
  /** Smart wallet / vault address being signed for. */
  readonly walletAddress?: string;
  /** Transaction hash returned by Knit/vault-core for the pending operation. */
  readonly transactionHash?: Hex;
  /** @deprecated Use walletAddress. */
  readonly safeAddress?: string;
  /** @deprecated Use transactionHash. */
  readonly safeTxHash?: Hex;
  /**
   * Require the connected wallet to match this owner address before signing.
   * Use the signer address registered in Knit/vault-core.
   */
  readonly expectedSignerAddress?: string;
  /**
   * Defaults to true. Calls eth_requestAccounts before signing so injected
   * wallets and WalletConnect sessions are connected.
   */
  readonly requestAccounts?: boolean;
}

export interface EoaSignature {
  /** 0x-prefixed r || s || v signature accepted by Safe/Knit as EOA ECDSA. */
  readonly signature: Hex;
  /** Connected EOA owner address that produced the signature. */
  readonly signerAddress: string;
}
