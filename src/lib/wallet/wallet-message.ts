/**
 * Wallet Link Message Builder
 *
 * Constructs a standardized message for EVM wallet linking that includes
 * replay-prevention fields (timestamp, nonce, domain separator).
 *
 * The backend validates this exact format — any drift between frontend
 * and backend will cause linking to fail.
 *
 * @see src/satellite/src/lib.rs — verify_wallet_signature()
 */

/**
 * Build a structured message for wallet-linking signature requests.
 *
 * Format:
 * ```
 * TRESR Wallet Link
 * Principal: {principalId}
 * Wallet: {address}
 * Timestamp: {unixSeconds}
 * Nonce: {uuid}
 * ```
 *
 * @param principalId - The IC principal of the user
 * @param address     - The EVM wallet address (0x...)
 * @returns The message string to be signed via personal_sign
 */
export function buildWalletLinkMessage(
  principalId: string,
  address: string
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();

  return [
    "TRESR Wallet Link",
    `Principal: ${principalId}`,
    `Wallet: ${address}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}
