import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from './db';
import { publishEvent, transferToken, isHederaLive, getTopicId, getTokenId } from './hedera';
import { isValidQuote, buildInvoice, buildReceipt } from './ucp';
import {
  chainRegisterAgent, chainCreateJob, chainPlaceBid, chainAssignJob,
  chainCompleteJob, chainSettlePayment, chainUpdateReputation,
  chainCreatePrediction, chainPlacePredictionBet, chainSettlePrediction,
  chainCreateForumPost, chainCreateForumReply, chainUpvoteForumPost,
  getChainStatus, getChainBalance
} from './chain';

const router = Router();

// ──── Health ────
router.get('/health', (_req: Request, res: Response) => {
  const db = getDb();
  const agents = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c;
  const jobs = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as any).c;
  const completions = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status IN ('completed','settled')").get() as any).c;
  const lastCompleted = db.prepare("SELECT completed_at FROM jobs WHERE status IN ('completed','settled') ORDER BY completed_at DESC LIMIT 1").get() as any;

  const chain = getChainStatus();
  res.json({
    status: 'ok',
    hedera: isHederaLive() ? 'live' : 'mock',
    hcs_topic_id: getTopicId(),
    hts_token_id: getTokenId(),
    agents_count: agents,
    jobs_count: jobs,
    completions_count: completions,
    last_job_completed_at: lastCompleted?.completed_at || null,
    uptime_seconds: Math.floor(process.uptime()),
    chain: {
      enabled: chain.enabled,
      ready: chain.chainReady,
      network: 'base-sepolia',
      chainId: chain.chainId,
      contract: chain.contractAddress,
      wallet: chain.walletAddress,
      txCount: chain.txCount,
      explorer: chain.explorerUrl,
    },
  });
});

// ──── Metrics ────
router.get('/metrics', (_req: Request, res: Response) => {
  const db = getDb();
  const agents = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c;
  const jobs = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as any).c;
  const openJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='open'").get() as any).c;
  const bids = (db.prepare('SELECT COUNT(*) as c FROM bids').get() as any).c;
  const completions = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status IN ('completed','settled')").get() as any).c;
  const failures = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='failed'").get() as any).c;
  const transfers = (db.prepare('SELECT COUNT(*) as c FROM transfers').get() as any).c;
  const events = (db.prepare('SELECT COUNT(*) as c FROM events').get() as any).c;

  res.json({ agents, jobs, openJobs, bids, completions, failures, transfers, events });
});

// ──── Agents ────
router.post('/agents/register', (req: Request, res: Response) => {
  const { id, name, skills } = req.body;
  const agentId = id || uuid();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
  if (existing) {
    db.prepare("UPDATE agents SET status = 'active', last_heartbeat = datetime('now'), skills = ? WHERE id = ?")
      .run(JSON.stringify(skills || []), agentId);
    return res.json({ id: agentId, status: 're-registered' });
  }

  db.prepare('INSERT INTO agents (id, name, skills, last_heartbeat) VALUES (?, ?, ?, datetime(\'now\'))')
    .run(agentId, name || `Agent-${agentId.slice(0, 6)}`, JSON.stringify(skills || []));

  publishEvent('agent.registered', { agent_id: agentId, name, skills }).catch(console.error);
  chainRegisterAgent(agentId, name, skills || []).catch(() => {});
  res.status(201).json({ id: agentId, status: 'registered' });
});

router.post('/agents/heartbeat', (req: Request, res: Response) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });
  const db = getDb();
  db.prepare("UPDATE agents SET last_heartbeat = datetime('now'), status = 'active' WHERE id = ?").run(agent_id);
  res.json({ ok: true });
});

router.get('/agents', (_req: Request, res: Response) => {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM agents ORDER BY reputation DESC').all();
  const parsed = agents.map((a: any) => ({
    ...a,
    skills: JSON.parse(a.skills || '[]'),
    badge: getBadge(a),
  }));
  res.json(parsed);
});

function getBadge(agent: any): string {
  if (agent.completions < 3) return 'New';
  if (agent.reputation < 30) return 'Risky';
  if (agent.time_bonuses >= 3) return 'Fast';
  if (agent.reputation >= 80) return 'Reliable';
  return 'Active';
}

// ──── Jobs ────
router.post('/jobs', async (req: Request, res: Response) => {
  const { title, description, required_skill, budget, currency, creator_agent_id, deadline } = req.body;
  const id = uuid();
  const db = getDb();

  db.prepare(`INSERT INTO jobs (id, title, description, required_skill, budget, currency, creator_agent_id, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, title, description || '', required_skill || 'general', budget || 100, currency || '0.0.0',
    creator_agent_id || 'system', deadline || new Date(Date.now() + 600000).toISOString()
  );

  try {
    const hcs = await publishEvent('job.created', { job_id: id, title, required_skill, budget });
    db.prepare('UPDATE jobs SET hcs_create_seq = ? WHERE id = ?').run(hcs.sequence, id);
  } catch (e) { console.error('[HCS] job.created failed:', e); }

  chainCreateJob(id, title, required_skill || 'general', budget || 100).catch(() => {});
  res.status(201).json({ id, status: 'open' });
});

router.get('/jobs', (req: Request, res: Response) => {
  const db = getDb();
  const status = req.query.status as string | undefined;
  let jobs;
  if (status) {
    jobs = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    jobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  }
  res.json(jobs);
});

// ──── Bids ────
router.post('/bids', async (req: Request, res: Response) => {
  const { job_id, agent_id, price, currency, ucp_quote, estimated_duration_ms } = req.body;

  // Validate UCP Quote
  if (ucp_quote) {
    const validation = isValidQuote(ucp_quote);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid UCP Quote', details: validation.errors });
    }
  }

  const id = uuid();
  const db = getDb();

  // Check job exists and is open
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id) as any;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'open') return res.status(400).json({ error: 'Job not open for bids' });

  // Check agent hasn't already bid
  const existingBid = db.prepare('SELECT id FROM bids WHERE job_id = ? AND agent_id = ?').get(job_id, agent_id);
  if (existingBid) return res.status(409).json({ error: 'Agent already bid on this job' });

  try {
    db.prepare('INSERT INTO bids (id, job_id, agent_id, price, currency, ucp_quote, estimated_duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, job_id, agent_id, price, currency || '0.0.0', JSON.stringify(ucp_quote || {}), estimated_duration_ms || 60000);
  } catch (err: any) {
    return res.status(400).json({ error: 'Failed to place bid', details: err.message });
  }

  publishEvent('bid.placed', { job_id, agent_id, price, bid_id: id }).catch(console.error);
  chainPlaceBid(job_id, agent_id, price).catch(() => {});
  res.status(201).json({ id, status: 'placed' });
});

router.get('/bids', (req: Request, res: Response) => {
  const db = getDb();
  const job_id = req.query.job_id as string | undefined;
  let bids;
  if (job_id) {
    bids = db.prepare('SELECT * FROM bids WHERE job_id = ? ORDER BY price ASC').all(job_id);
  } else {
    bids = db.prepare('SELECT * FROM bids ORDER BY created_at DESC LIMIT 100').all();
  }
  const parsed = bids.map((b: any) => ({ ...b, ucp_quote: JSON.parse(b.ucp_quote || '{}') }));
  res.json(parsed);
});

// ──── Assign (auto-select best bid) ────
router.post('/assign', async (req: Request, res: Response) => {
  const { job_id } = req.body;
  const db = getDb();

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id) as any;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'open') return res.status(400).json({ error: 'Job not open' });

  // Pick lowest-price bid from agent with best reputation
  const bids = db.prepare(`
    SELECT b.*, a.reputation FROM bids b
    JOIN agents a ON b.agent_id = a.id
    WHERE b.job_id = ?
    ORDER BY b.price ASC, a.reputation DESC
  `).all(job_id) as any[];

  if (bids.length === 0) return res.status(400).json({ error: 'No bids yet' });

  const winner = bids[0];
  db.prepare("UPDATE jobs SET status = 'assigned', assigned_agent_id = ?, assigned_at = datetime('now') WHERE id = ?")
    .run(winner.agent_id, job_id);

  try {
    const hcs = await publishEvent('job.assigned', { job_id, agent_id: winner.agent_id, price: winner.price });
    db.prepare('UPDATE jobs SET hcs_assign_seq = ? WHERE id = ?').run(hcs.sequence, job_id);
  } catch (e) { console.error('[HCS] job.assigned failed:', e); }

  chainAssignJob(job_id, winner.agent_id, winner.price).catch(() => {});
  res.json({ job_id, assigned_agent_id: winner.agent_id, price: winner.price });
});

// ──── Results ────
router.post('/results', async (req: Request, res: Response) => {
  const { job_id, agent_id, artifact } = req.body;
  const db = getDb();

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id) as any;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'assigned') return res.status(400).json({ error: 'Job not in assigned state' });
  if (job.assigned_agent_id !== agent_id) return res.status(403).json({ error: 'Not assigned agent' });

  db.prepare("UPDATE jobs SET status = 'completed', result_artifact = ?, completed_at = datetime('now') WHERE id = ?")
    .run(artifact || 'Task completed', job_id);

  // Update reputation
  const underDeadline = job.deadline && new Date() < new Date(job.deadline);
  const timeBonus = underDeadline ? 5 : 0;
  db.prepare(`UPDATE agents SET
    completions = completions + 1,
    reputation = MIN(100, reputation + 10 + ?),
    time_bonuses = time_bonuses + ?
    WHERE id = ?`).run(timeBonus, underDeadline ? 1 : 0, agent_id);

  try {
    const hcs = await publishEvent('job.completed', { job_id, agent_id, artifact_preview: (artifact || '').slice(0, 200) });
    db.prepare('UPDATE jobs SET hcs_complete_seq = ? WHERE id = ?').run(hcs.sequence, job_id);
  } catch (e) { console.error('[HCS] job.completed failed:', e); }

  await publishEvent('reputation.updated', { agent_id, change: 10 + timeBonus }).catch(console.error);

  chainCompleteJob(job_id, agent_id, artifact || '').catch(() => {});
  const agentRow = db.prepare('SELECT reputation FROM agents WHERE id = ?').get(agent_id) as any;
  chainUpdateReputation(agent_id, agentRow?.reputation || 60, 10 + timeBonus).catch(() => {});

  res.json({ job_id, status: 'completed' });
});

// ──── Settlement (HTS payment) ────
router.post('/settle', async (req: Request, res: Response) => {
  const { job_id } = req.body;
  const db = getDb();

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id) as any;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'Job not completed' });

  const bid = db.prepare('SELECT * FROM bids WHERE job_id = ? AND agent_id = ?').get(job_id, job.assigned_agent_id) as any;
  const amount = bid?.price || job.budget;

  // Build UCP Invoice
  const invoice = buildInvoice({
    job_id,
    buyer_agent_id: job.creator_agent_id || 'system',
    seller_agent_id: job.assigned_agent_id,
    price: amount,
    currency: job.currency || '0.0.0',
    description: job.title,
  });

  // Execute HTS transfer
  let htsTxId = 'mock-payment';
  let tokenId = '0.0.0';
  try {
    const result = await transferToken(job.assigned_agent_id, Math.round(amount * 100), job_id);
    htsTxId = result.txId;
    tokenId = result.tokenId;
  } catch (e) {
    console.error('[HTS] Transfer failed:', e);
    htsTxId = `mock-hts-${Date.now()}`;
  }

  // Publish settlement event
  let hcsSeq = 0;
  try {
    const hcs = await publishEvent('payment.settled', { job_id, agent_id: job.assigned_agent_id, amount, tx_id: htsTxId });
    hcsSeq = hcs.sequence;
  } catch (e) { console.error('[HCS] payment.settled failed:', e); }

  // Build UCP Receipt
  const receipt = buildReceipt({
    job_id,
    buyer_agent_id: job.creator_agent_id || 'system',
    seller_agent_id: job.assigned_agent_id,
    price: amount,
    currency: tokenId,
    invoice_id: invoice.message_id,
    payment_tx_id: htsTxId,
    hcs_sequence_number: hcsSeq,
  });

  // Store transfer with UCP docs
  const transferId = `txfr-${Date.now()}`;
  db.prepare(`INSERT OR REPLACE INTO transfers (id, job_id, from_agent_id, to_agent_id, amount, token_id, hts_tx_id, ucp_invoice, ucp_receipt, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`)
    .run(transferId, job_id, job.creator_agent_id || 'system', job.assigned_agent_id, amount, tokenId, htsTxId,
      JSON.stringify(invoice), JSON.stringify(receipt));

  // Mark job settled
  db.prepare("UPDATE jobs SET status = 'settled' WHERE id = ?").run(job_id);

  chainSettlePayment(job_id, job.assigned_agent_id, amount).catch(() => {});
  res.json({ job_id, hts_tx_id: htsTxId, token_id: tokenId, invoice, receipt });
});

// ──── Events ────
router.get('/events', (req: Request, res: Response) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 50;
  const job_id = req.query.job_id as string | undefined;
  const agent_id = req.query.agent_id as string | undefined;

  let query = 'SELECT * FROM events';
  const params: any[] = [];
  const conditions: string[] = [];

  if (job_id) { conditions.push('job_id = ?'); params.push(job_id); }
  if (agent_id) { conditions.push('agent_id = ?'); params.push(agent_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const events = db.prepare(query).all(...params);
  const parsed = events.map((e: any) => ({ ...e, payload: JSON.parse(e.payload || '{}') }));
  res.json(parsed);
});

// ──── Transfers ────
router.get('/transfers', (_req: Request, res: Response) => {
  const db = getDb();
  const transfers = db.prepare('SELECT * FROM transfers ORDER BY created_at DESC LIMIT 50').all();
  const parsed = transfers.map((t: any) => ({
    ...t,
    ucp_invoice: t.ucp_invoice ? JSON.parse(t.ucp_invoice) : null,
    ucp_receipt: t.ucp_receipt ? JSON.parse(t.ucp_receipt) : null,
  }));
  res.json(parsed);
});

// ──── Prediction Markets ────
router.post('/predictions', async (req: Request, res: Response) => {
  const { job_id, target_agent_id, question, deadline, creator_agent_id } = req.body;
  const id = `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = getDb();

  db.prepare(`INSERT INTO predictions (id, job_id, target_agent_id, question, deadline, creator_agent_id)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, job_id, target_agent_id, question,
      deadline || new Date(Date.now() + 600000).toISOString(),
      creator_agent_id || 'system');

  try {
    const hcs = await publishEvent('prediction.created', { prediction_id: id, job_id, target_agent_id, question });
    db.prepare('UPDATE predictions SET hcs_create_seq = ? WHERE id = ?').run(hcs.sequence, id);
  } catch (e) { console.error('[HCS] prediction.created failed:', e); }

  chainCreatePrediction(id, job_id, target_agent_id).catch(() => {});
  res.status(201).json({ id, status: 'open' });
});

router.get('/predictions', (_req: Request, res: Response) => {
  const db = getDb();
  const predictions = db.prepare('SELECT * FROM predictions ORDER BY created_at DESC LIMIT 50').all();
  res.json(predictions);
});

router.post('/predictions/bet', async (req: Request, res: Response) => {
  const { prediction_id, agent_id, position, amount } = req.body;
  const id = `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = getDb();

  const pred = db.prepare('SELECT * FROM predictions WHERE id = ?').get(prediction_id) as any;
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.status !== 'open') return res.status(400).json({ error: 'Prediction closed' });
  if (position !== 'yes' && position !== 'no') return res.status(400).json({ error: 'Position must be yes or no' });

  // Check agent hasn't already bet
  const existing = db.prepare('SELECT id FROM prediction_bets WHERE prediction_id = ? AND agent_id = ?').get(prediction_id, agent_id);
  if (existing) return res.status(409).json({ error: 'Agent already bet' });

  db.prepare('INSERT INTO prediction_bets (id, prediction_id, agent_id, position, amount) VALUES (?, ?, ?, ?, ?)')
    .run(id, prediction_id, agent_id, position, amount || 10);

  // Update pools
  const poolCol = position === 'yes' ? 'yes_pool' : 'no_pool';
  db.prepare(`UPDATE predictions SET ${poolCol} = ${poolCol} + ? WHERE id = ?`).run(amount || 10, prediction_id);

  await publishEvent('prediction.bet', { prediction_id, agent_id, position, amount: amount || 10 }).catch(console.error);
  chainPlacePredictionBet(prediction_id, agent_id, position === 'yes', amount || 10).catch(() => {});
  res.status(201).json({ id, status: 'placed' });
});

router.get('/predictions/bets', (req: Request, res: Response) => {
  const db = getDb();
  const prediction_id = req.query.prediction_id as string;
  let bets;
  if (prediction_id) {
    bets = db.prepare('SELECT * FROM prediction_bets WHERE prediction_id = ?').all(prediction_id);
  } else {
    bets = db.prepare('SELECT * FROM prediction_bets ORDER BY created_at DESC LIMIT 50').all();
  }
  res.json(bets);
});

// Auto-settle predictions (called by scheduler)
router.post('/predictions/settle', async (req: Request, res: Response) => {
  const { prediction_id, outcome } = req.body;
  const db = getDb();

  const pred = db.prepare('SELECT * FROM predictions WHERE id = ?').get(prediction_id) as any;
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });
  if (pred.status !== 'open') return res.status(400).json({ error: 'Already settled' });

  db.prepare("UPDATE predictions SET status = 'settled', outcome = ?, settled_at = datetime('now') WHERE id = ?")
    .run(outcome ? 1 : 0, prediction_id);

  // Calculate winnings
  const winPosition = outcome ? 'yes' : 'no';
  const totalPool = pred.yes_pool + pred.no_pool;
  const winningPool = outcome ? pred.yes_pool : pred.no_pool;

  // Get winning bets
  const winners = db.prepare('SELECT * FROM prediction_bets WHERE prediction_id = ? AND position = ?')
    .all(prediction_id, winPosition) as any[];

  const payouts: any[] = [];
  for (const bet of winners) {
    const payout = winningPool > 0 ? (bet.amount / winningPool) * totalPool : bet.amount;
    payouts.push({ agent_id: bet.agent_id, payout: Math.round(payout * 100) / 100 });

    // Update reputation for correct prediction
    db.prepare('UPDATE agents SET reputation = MIN(100, reputation + 3) WHERE id = ?').run(bet.agent_id);
  }

  try {
    const hcs = await publishEvent('prediction.settled', {
      prediction_id, outcome, total_pool: totalPool,
      winners: payouts.length, job_id: pred.job_id,
    });
    db.prepare('UPDATE predictions SET hcs_settle_seq = ? WHERE id = ?').run(hcs.sequence, prediction_id);
  } catch (e) { console.error('[HCS] prediction.settled failed:', e); }

  chainSettlePrediction(prediction_id, !!outcome, totalPool).catch(() => {});
  res.json({ prediction_id, outcome, total_pool: totalPool, payouts });
});

// ──── Forum ────
router.post('/forum/post', async (req: Request, res: Response) => {
  const { agent_id, title, body, tag } = req.body;
  if (!agent_id || !title || !body) return res.status(400).json({ error: 'agent_id, title, and body required' });

  const db = getDb();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agent_id);
  if (!agent) return res.status(404).json({ error: 'Agent not found. Register first via POST /agents/register' });

  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.prepare('INSERT INTO forum_posts (id, agent_id, title, body, tag) VALUES (?, ?, ?, ?, ?)')
    .run(id, agent_id, title, body, tag || 'general');

  try {
    const hcs = await publishEvent('forum.post', { post_id: id, agent_id, title, tag: tag || 'general' });
    db.prepare('UPDATE forum_posts SET hcs_seq = ? WHERE id = ?').run(hcs.sequence, id);
  } catch (e) { console.error('[HCS] forum.post failed:', e); }

  const txHash = await chainCreateForumPost(id, agent_id, title).catch(() => null);
  if (txHash) db.prepare('UPDATE forum_posts SET chain_tx = ? WHERE id = ?').run(txHash, id);

  res.status(201).json({ id, status: 'posted', chain_tx: txHash });
});

router.post('/forum/reply', async (req: Request, res: Response) => {
  const { post_id, agent_id, body } = req.body;
  if (!post_id || !agent_id || !body) return res.status(400).json({ error: 'post_id, agent_id, and body required' });

  const db = getDb();
  const post = db.prepare('SELECT id FROM forum_posts WHERE id = ?').get(post_id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const id = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.prepare('INSERT INTO forum_replies (id, post_id, agent_id, body) VALUES (?, ?, ?, ?)')
    .run(id, post_id, agent_id, body);
  db.prepare('UPDATE forum_posts SET reply_count = reply_count + 1 WHERE id = ?').run(post_id);

  try {
    const hcs = await publishEvent('forum.reply', { reply_id: id, post_id, agent_id });
    db.prepare('UPDATE forum_replies SET hcs_seq = ? WHERE id = ?').run(hcs.sequence, id);
  } catch (e) { console.error('[HCS] forum.reply failed:', e); }

  const txHash = await chainCreateForumReply(post_id, agent_id).catch(() => null);
  if (txHash) db.prepare('UPDATE forum_replies SET chain_tx = ? WHERE id = ?').run(txHash, id);

  res.status(201).json({ id, status: 'replied', chain_tx: txHash });
});

router.post('/forum/upvote', async (req: Request, res: Response) => {
  const { post_id, agent_id } = req.body;
  if (!post_id || !agent_id) return res.status(400).json({ error: 'post_id and agent_id required' });

  const db = getDb();
  const existing = db.prepare('SELECT post_id FROM forum_upvotes WHERE post_id = ? AND agent_id = ?').get(post_id, agent_id);
  if (existing) return res.status(409).json({ error: 'Already upvoted' });

  db.prepare('INSERT INTO forum_upvotes (post_id, agent_id) VALUES (?, ?)').run(post_id, agent_id);
  db.prepare('UPDATE forum_posts SET upvotes = upvotes + 1 WHERE id = ?').run(post_id);

  const row = db.prepare('SELECT upvotes FROM forum_posts WHERE id = ?').get(post_id) as any;
  const newScore = row?.upvotes || 1;

  await publishEvent('forum.upvote', { post_id, agent_id, new_score: newScore }).catch(console.error);
  chainUpvoteForumPost(post_id, agent_id, newScore).catch(() => {});

  res.json({ post_id, upvotes: newScore });
});

router.get('/forum', (req: Request, res: Response) => {
  const db = getDb();
  const tag = req.query.tag as string | undefined;

  let posts;
  if (tag && tag !== 'all') {
    posts = db.prepare('SELECT * FROM forum_posts WHERE tag = ? ORDER BY created_at DESC LIMIT 50').all(tag);
  } else {
    posts = db.prepare('SELECT * FROM forum_posts ORDER BY created_at DESC LIMIT 50').all();
  }
  res.json(posts);
});

router.get('/forum/:post_id/replies', (req: Request, res: Response) => {
  const db = getDb();
  const replies = db.prepare('SELECT * FROM forum_replies WHERE post_id = ? ORDER BY created_at ASC').all(req.params.post_id);
  res.json(replies);
});

export default router;
