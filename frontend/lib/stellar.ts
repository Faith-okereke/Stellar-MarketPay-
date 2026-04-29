/**
 * lib/stellar.ts
 * Stellar blockchain helpers for MarketPay.
 */

import {
  Horizon, Networks, Asset, Operation, TransactionBuilder, Transaction,
  Contract, nativeToScVal, Address,
} from "@stellar/stellar-sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";
import {
  mockCreateEscrow,
  mockStartWork,
  mockReleaseEscrow,
  mockRefundEscrow,
  mockGetEscrow,
  mockGetStatus,
  mockGetEscrowCount,
} from "./contractMock";

const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "mainnet";
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_CONTRACT_MOCK === "true";

export const NETWORK_PASSPHRASE = NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
export const server = new Horizon.Server(HORIZON_URL);
export const sorobanServer = new SorobanRpc.Server(SOROBAN_RPC_URL);

// XLM SAC (Stellar Asset Contract) address on testnet
export const XLM_SAC_ADDRESS =
  NETWORK === "mainnet"
    ? "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
    : "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// USDC asset issued by Circle
export const USDC_ISSUER =
  NETWORK === "mainnet"
    ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    : "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC = new Asset("USDC", USDC_ISSUER);

// ─── Account ─────────────────────────────────────────────────────────────────

export async function getXLMBalance(publicKey: string): Promise<string> {
  try {
    const account = await server.loadAccount(publicKey);
    const xlm = account.balances.find((b) => b.asset_type === "native");
    return xlm ? xlm.balance : "0";
  } catch {
    throw new Error("Account not found or not funded.");
  }
}

export async function getUSDCBalance(publicKey: string): Promise<string | null> {
  try {
    const account = await server.loadAccount(publicKey);
    const usdc = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLineAsset =>
        b.asset_type !== "native" &&
        (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === "USDC" &&
        (b as Horizon.HorizonApi.BalanceLineAsset).asset_issuer === USDC_ISSUER
    );
    return usdc ? usdc.balance : null;
  } catch {
    return null;
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Build an unsigned payment transaction for XLM or USDC.
 */
export async function buildPaymentTransaction({
  fromPublicKey, toPublicKey, amount, memo, asset = "XLM",
}: {
  fromPublicKey: string;
  toPublicKey: string;
  amount: string;
  memo?: string;
  asset?: "XLM" | "USDC";
}) {
  const sourceAccount = await server.loadAccount(fromPublicKey);

  // Check recipient trustline for USDC
  if (asset === "USDC") {
    const recipient = await server.loadAccount(toPublicKey).catch(() => null);
    if (!recipient) throw new Error("Recipient account not found on Stellar network.");
    const hasTrustline = recipient.balances.some(
      (b): b is Horizon.HorizonApi.BalanceLineAsset =>
        b.asset_type !== "native" &&
        (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === "USDC" &&
        (b as Horizon.HorizonApi.BalanceLineAsset).asset_issuer === USDC_ISSUER
    );
    if (!hasTrustline) {
      throw new Error("Recipient has no USDC trustline. They must add USDC to their wallet first.");
    }
  }

  const builder = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: toPublicKey,
      asset: asset === "USDC" ? USDC : Asset.native(),
      amount,
    }))
    .setTimeout(60);

  if (memo) {
    const { Memo } = await import("@stellar/stellar-sdk");
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  return builder.build();
}

export async function submitTransaction(signedXDR: string) {
  const tx = new Transaction(signedXDR, NETWORK_PASSPHRASE);
  try {
    return await server.submitTransaction(tx);
  } catch (err: unknown) {
    const e = err as { response?: { data?: { extras?: { result_codes?: unknown } } } };
    if (e?.response?.data?.extras?.result_codes) {
      throw new Error(`Transaction failed: ${JSON.stringify(e.response.data.extras.result_codes)}`);
    }
    throw err;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(address);
}

export function explorerUrl(hash: string): string {
  const net = NETWORK === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

export function accountUrl(address: string): string {
  const net = NETWORK === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/account/${address}`;
}

// ─── Soroban / Escrow ─────────────────────────────────────────────────────────

/**
 * Build an unsigned Soroban transaction that calls create_escrow() on the
 * MarketPay contract. The caller must sign it with Freighter and submit via
 * submitSorobanTransaction().
 *
 * When NEXT_PUBLIC_USE_CONTRACT_MOCK=true, returns a mock transaction that
 * bypasses the network entirely.
 *
 * @param clientPublicKey  Stellar address of the client (signer + payer)
 * @param jobId            Backend job UUID
 * @param freelancerAddress Stellar address of the freelancer
 * @param budgetXLM        Budget in XLM (e.g. "100.0000000")
 */
export async function buildCreateEscrowTransaction({
  clientPublicKey,
  jobId,
  freelancerAddress,
  budgetXLM,
}: {
  clientPublicKey: string;
  jobId: string;
  freelancerAddress: string;
  budgetXLM: string;
}) {
  // Mock mode: return a fake transaction object
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode");
    return {
      toXDR: () => "MOCK_UNSIGNED_XDR",
      _mockParams: {
        jobId,
        client: clientPublicKey,
        freelancer: freelancerAddress,
        token: XLM_SAC_ADDRESS,
        amount: String(BigInt(Math.round(parseFloat(budgetXLM) * 10_000_000))),
      },
    } as any;
  }

  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
  if (!contractId) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not set");

  // Convert XLM to stroops (1 XLM = 10_000_000 stroops)
  const amountStroops = BigInt(Math.round(parseFloat(budgetXLM) * 10_000_000));

  const contract = new Contract(contractId);
  const sourceAccount = await sorobanServer.getAccount(clientPublicKey);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "1000000", // generous fee for Soroban ops
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "create_escrow",
        nativeToScVal(jobId, { type: "string" }),
        new Address(clientPublicKey).toScVal(),
        new Address(freelancerAddress).toScVal(),
        new Address(XLM_SAC_ADDRESS).toScVal(),
        nativeToScVal(amountStroops, { type: "i128" }),
      )
    )
    .setTimeout(60)
    .build();

  // Simulate to get the correct resource footprint
  const simResult = await sorobanServer.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  return SorobanRpc.assembleTransaction(tx, simResult).build();
}

/**
 * Submit a signed Soroban transaction and poll until it's confirmed.
 * 
 * When NEXT_PUBLIC_USE_CONTRACT_MOCK=true, calls the mock contract instead.
 */
export async function submitSorobanTransaction(signedXDR: string, mockParams?: any): Promise<string> {
  // Mock mode: call mock contract
  if (USE_MOCK && signedXDR === "MOCK_SIGNED_XDR" && mockParams) {
    console.log("[STELLAR] Submitting to mock contract");
    return await mockCreateEscrow(mockParams);
  }

  const sendResult = await sorobanServer.sendTransaction(
    new Transaction(signedXDR, NETWORK_PASSPHRASE)
  );

  if (sendResult.status === "ERROR") {
    throw new Error(`Soroban submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const hash = sendResult.hash;

  // Poll for confirmation (up to 30s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await sorobanServer.getTransaction(hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Soroban transaction failed: ${hash}`);
    }
  }

  throw new Error(`Soroban transaction timed out: ${hash}`);
}

/**
 * Build and submit start_work transaction.
 * Marks escrow as in-progress when client accepts a freelancer.
 */
export async function startWork(jobId: string, clientPublicKey: string): Promise<string> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for start_work");
    return await mockStartWork({ jobId, client: clientPublicKey });
  }

  // Real implementation would build + sign + submit transaction
  throw new Error("start_work not yet implemented for real contract");
}

/**
 * Build and submit release_escrow transaction.
 * Releases funds to freelancer when work is approved.
 */
export async function releaseEscrow(jobId: string, clientPublicKey: string): Promise<string> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for release_escrow");
    return await mockReleaseEscrow({ jobId, client: clientPublicKey });
  }

  // Real implementation would build + sign + submit transaction
  throw new Error("release_escrow not yet implemented for real contract");
}

/**
 * Build and submit refund_escrow transaction.
 * Returns funds to client before work starts.
 */
export async function refundEscrow(jobId: string, clientPublicKey: string): Promise<string> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for refund_escrow");
    return await mockRefundEscrow({ jobId, client: clientPublicKey });
  }

  // Real implementation would build + sign + submit transaction
  throw new Error("refund_escrow not yet implemented for real contract");
}

/**
 * Query escrow status for a job.
 */
export async function getEscrowStatus(jobId: string): Promise<string> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for get_status");
    return await mockGetStatus(jobId);
  }

  // Real implementation would query contract
  throw new Error("get_status not yet implemented for real contract");
}

/**
 * Query full escrow record for a job.
 */
export async function getEscrow(jobId: string): Promise<any> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for get_escrow");
    return await mockGetEscrow(jobId);
  }

  // Real implementation would query contract
  throw new Error("get_escrow not yet implemented for real contract");
}

/**
 * Query total escrow count.
 */
export async function getEscrowCount(): Promise<number> {
  if (USE_MOCK) {
    console.log("[STELLAR] Using contract mock mode for get_escrow_count");
    return await mockGetEscrowCount();
  }

  // Real implementation would query contract
  throw new Error("get_escrow_count not yet implemented for real contract");
}
