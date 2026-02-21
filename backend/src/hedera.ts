import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TokenCreateTransaction,
  TransferTransaction,
  AccountId,
  PrivateKey,
  Hbar,
  TopicId,
  TokenId,
  TokenType,
  TokenSupplyType,
} from '@hashgraph/sdk';
import { getDb, saveConfig, getConfig } from './db';

let client: Client | null = null;
let operatorId: string = '';
let operatorKey: PrivateKey | null = null;

export function initHedera(): boolean {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || 'testnet';

  if (!accountId || !privateKey) {
    console.warn('[Hedera] No credentials found — running in MOCK mode');
    return false;
  }

  try {
    operatorKey = PrivateKey.fromStringED25519(privateKey);
    operatorId = accountId;

    if (network === 'mainnet') {
      client = Client.forMainnet();
    } else {
      client = Client.forTestnet();
    }
    client.setOperator(accountId, operatorKey);
    client.setDefaultMaxTransactionFee(new Hbar(10));
    console.log(`[Hedera] Client initialized for ${network} as ${accountId}`);
    return true;
  } catch (err) {
    console.warn('[Hedera] Failed to init client:', err);
    return false;
  }
}

export function isHederaLive(): boolean {
  return client !== null;
}

// ──── HCS (Consensus Service) ────

let topicId: string | null = null;

export async function ensureTopic(): Promise<string> {
  // Check env first
  if (process.env.HCS_TOPIC_ID) {
    topicId = process.env.HCS_TOPIC_ID;
    return topicId;
  }

  // Check DB
  const stored = getConfig('hcs_topic_id');
  if (stored) {
    topicId = stored;
    return topicId;
  }

  if (!client) {
    topicId = 'mock-topic-0.0.0';
    saveConfig('hcs_topic_id', topicId);
    return topicId;
  }

  // Create new topic
  const tx = await new TopicCreateTransaction()
    .setSubmitKey(operatorKey!)
    .setTopicMemo('ClawGuild Agent Society Events')
    .execute(client);

  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId!.toString();
  saveConfig('hcs_topic_id', topicId);
  console.log(`[HCS] Created topic: ${topicId}`);
  return topicId;
}

export async function publishEvent(
  eventType: string,
  payload: Record<string, any>
): Promise<{ txId: string; sequence: number; topicId: string }> {
  const topic = await ensureTopic();
  const message = JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  if (!client || topic.startsWith('mock')) {
    // Mock mode
    const mockSeq = Math.floor(Math.random() * 1000000);
    const mockTxId = `mock-tx-${Date.now()}-${mockSeq}`;
    storeEvent(eventType, payload, mockTxId, mockSeq, topic);
    return { txId: mockTxId, sequence: mockSeq, topicId: topic };
  }

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topic))
    .setMessage(message)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const sequence = receipt.topicSequenceNumber?.toNumber() || 0;
  const txId = tx.transactionId.toString();

  storeEvent(eventType, payload, txId, sequence, topic);
  return { txId, sequence, topicId: topic };
}

function storeEvent(
  eventType: string,
  payload: Record<string, any>,
  txId: string,
  sequence: number,
  topic: string
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO events (event_type, payload, job_id, agent_id, hcs_tx_id, hcs_sequence, hcs_topic_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType,
    JSON.stringify(payload),
    payload.job_id || null,
    payload.agent_id || null,
    txId,
    sequence,
    topic
  );
}

// ──── HTS (Token Service) ────

let tokenId: string | null = null;

export async function ensureToken(): Promise<string> {
  if (process.env.HTS_TOKEN_ID) {
    tokenId = process.env.HTS_TOKEN_ID;
    return tokenId;
  }

  const stored = getConfig('hts_token_id');
  if (stored) {
    tokenId = stored;
    return tokenId;
  }

  if (!client) {
    tokenId = 'mock-token-0.0.0';
    saveConfig('hts_token_id', tokenId);
    return tokenId;
  }

  const tx = await new TokenCreateTransaction()
    .setTokenName('ClawGuild Credits')
    .setTokenSymbol('CLAW')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)
    .setInitialSupply(1000000)
    .setTreasuryAccountId(AccountId.fromString(operatorId))
    .setSupplyType(TokenSupplyType.Infinite)
    .setAdminKey(operatorKey!)
    .setSupplyKey(operatorKey!)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  tokenId = receipt.tokenId!.toString();
  saveConfig('hts_token_id', tokenId);
  console.log(`[HTS] Created token: ${tokenId}`);
  return tokenId;
}

export async function transferToken(
  toAccountId: string,
  amount: number,
  jobId: string
): Promise<{ txId: string; tokenId: string }> {
  const token = await ensureToken();

  if (!client || token.startsWith('mock')) {
    const mockTxId = `mock-hts-tx-${Date.now()}`;
    storeTransfer(jobId, operatorId, toAccountId, amount, token, mockTxId);
    return { txId: mockTxId, tokenId: token };
  }

  const tx = await new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(token), AccountId.fromString(operatorId), -amount)
    .addTokenTransfer(TokenId.fromString(token), AccountId.fromString(toAccountId), amount)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const txId = tx.transactionId.toString();

  storeTransfer(jobId, operatorId, toAccountId, amount, token, txId);
  return { txId, tokenId: token };
}

function storeTransfer(
  jobId: string,
  from: string,
  to: string,
  amount: number,
  token: string,
  txId: string
) {
  const db = getDb();
  const id = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO transfers (id, job_id, from_agent_id, to_agent_id, amount, token_id, hts_tx_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
  `).run(id, jobId, from, to, amount, token, txId);
}

export function getTopicId(): string | null {
  return topicId;
}

export function getTokenId(): string | null {
  return tokenId;
}
