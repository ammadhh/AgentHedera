import { getDb } from './db';
import { publishEvent } from './hedera';
import { buildInvoice, buildReceipt } from './ucp';
import { v4 as uuid } from 'uuid';

const JOB_TEMPLATES = [
  { title: 'Summarize recent DeFi trends', required_skill: 'summarize', budget: 50 },
  { title: 'Generate QA report on smart contracts', required_skill: 'qa-report', budget: 75 },
  { title: 'Write market analysis memo', required_skill: 'market-memo', budget: 60 },
  { title: 'Analyze token price movements', required_skill: 'summarize', budget: 45 },
  { title: 'Audit agent communication logs', required_skill: 'qa-report', budget: 80 },
  { title: 'Draft partnership proposal', required_skill: 'market-memo', budget: 90 },
  { title: 'Summarize governance proposals', required_skill: 'summarize', budget: 55 },
  { title: 'Generate security assessment', required_skill: 'qa-report', budget: 100 },
  { title: 'Write weekly ecosystem update', required_skill: 'market-memo', budget: 70 },
];

export function startScheduler(intervalMs: number) {
  console.log(`[Scheduler] Starting job creation every ${intervalMs / 1000}s`);

  // Create initial batch of jobs
  setTimeout(() => createJobBatch(3), 2000);

  // Then create jobs periodically
  setInterval(() => {
    const db = getDb();
    const openJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'open'").get() as any).c;
    if (openJobs < 3) {
      createJobBatch(2);
    }
  }, intervalMs);

  // Auto-assign jobs that have bids (fast for demo)
  setInterval(() => autoAssignJobs(), 8000);

  // Auto-settle completed jobs
  setInterval(() => autoSettleJobs(), 8000);

  // Create prediction markets for assigned jobs
  setInterval(() => createPredictions(), 12000);

  // Auto-settle prediction markets
  setInterval(() => settlePredictions(), 15000);

  // Watchdog: reset stuck jobs
  setInterval(() => watchdog(), 60000);
}

function createJobBatch(count: number) {
  const db = getDb();
  for (let i = 0; i < count; i++) {
    const template = JOB_TEMPLATES[Math.floor(Math.random() * JOB_TEMPLATES.length)];
    const id = uuid();
    const deadline = new Date(Date.now() + 600000).toISOString();

    db.prepare(`INSERT INTO jobs (id, title, description, required_skill, budget, currency, creator_agent_id, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, template.title, `Autonomous job: ${template.title}`, template.required_skill,
        template.budget, '0.0.0', 'system', deadline);

    publishEvent('job.created', { job_id: id, title: template.title, required_skill: template.required_skill, budget: template.budget })
      .catch(console.error);

    console.log(`[Scheduler] Created job: ${template.title} (${id.slice(0, 8)})`);
  }
}

function autoAssignJobs() {
  const db = getDb();
  const openJobsWithBids = db.prepare(`
    SELECT j.id, COUNT(b.id) as bid_count FROM jobs j
    JOIN bids b ON b.job_id = j.id
    WHERE j.status = 'open'
    GROUP BY j.id
    HAVING bid_count >= 1
  `).all() as any[];

  for (const job of openJobsWithBids) {
    const winner = db.prepare(`
      SELECT b.*, a.reputation FROM bids b
      JOIN agents a ON b.agent_id = a.id
      WHERE b.job_id = ?
      ORDER BY b.price ASC, a.reputation DESC LIMIT 1
    `).get(job.id) as any;

    if (winner) {
      db.prepare("UPDATE jobs SET status = 'assigned', assigned_agent_id = ?, assigned_at = datetime('now') WHERE id = ?")
        .run(winner.agent_id, job.id);

      publishEvent('job.assigned', { job_id: job.id, agent_id: winner.agent_id, price: winner.price })
        .catch(console.error);

      // Create prediction market immediately on assignment
      const jobData = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id) as any;
      if (jobData) {
        const predId = `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const deadline = jobData.deadline || new Date(Date.now() + 300000).toISOString();
        const question = `Will ${winner.agent_id.slice(0, 8)} complete "${jobData.title}" before deadline?`;

        try {
          db.prepare(`INSERT INTO predictions (id, job_id, target_agent_id, question, deadline, creator_agent_id)
            VALUES (?, ?, ?, ?, ?, 'system')`)
            .run(predId, job.id, winner.agent_id, question, deadline);

          publishEvent('prediction.created', { prediction_id: predId, job_id: job.id, target_agent_id: winner.agent_id, question })
            .catch(console.error);

          console.log(`[Predictions] Created market: ${question}`);
        } catch (_e) { /* prediction might already exist */ }
      }

      console.log(`[Scheduler] Auto-assigned job ${job.id.slice(0, 8)} to ${winner.agent_id.slice(0, 8)}`);
    }
  }
}

async function autoSettleJobs() {
  const db = getDb();
  const completedJobs = db.prepare("SELECT * FROM jobs WHERE status = 'completed'").all() as any[];

  for (const job of completedJobs) {
    // Check if already has a transfer
    const existing = db.prepare('SELECT id FROM transfers WHERE job_id = ?').get(job.id);
    if (existing) {
      db.prepare("UPDATE jobs SET status = 'settled' WHERE id = ?").run(job.id);
      continue;
    }

    // Trigger settlement via internal logic (same as /settle route)
    const bid = db.prepare('SELECT * FROM bids WHERE job_id = ? AND agent_id = ?').get(job.id, job.assigned_agent_id) as any;
    const amount = bid?.price || job.budget;

    const transferId = `txfr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const htsTxId = `mock-hts-${Date.now()}`;

    const invoice = buildInvoice({
      job_id: job.id,
      buyer_agent_id: job.creator_agent_id || 'system',
      seller_agent_id: job.assigned_agent_id,
      price: amount,
      currency: job.currency || '0.0.0',
      description: job.title,
    });

    const receipt = buildReceipt({
      job_id: job.id,
      buyer_agent_id: job.creator_agent_id || 'system',
      seller_agent_id: job.assigned_agent_id,
      price: amount,
      currency: job.currency || '0.0.0',
      invoice_id: invoice.message_id,
      payment_tx_id: htsTxId,
      hcs_sequence_number: 0,
    });

    db.prepare(`INSERT INTO transfers (id, job_id, from_agent_id, to_agent_id, amount, token_id, hts_tx_id, ucp_invoice, ucp_receipt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`)
      .run(transferId, job.id, job.creator_agent_id || 'system', job.assigned_agent_id, amount, '0.0.0', htsTxId,
        JSON.stringify(invoice), JSON.stringify(receipt));

    db.prepare("UPDATE jobs SET status = 'settled' WHERE id = ?").run(job.id);

    await publishEvent('payment.settled', { job_id: job.id, agent_id: job.assigned_agent_id, amount, tx_id: htsTxId })
      .catch(console.error);

    console.log(`[Scheduler] Auto-settled job ${job.id.slice(0, 8)} — ${amount} CLAW to ${job.assigned_agent_id.slice(0, 8)}`);
  }
}

function createPredictions() {
  const db = getDb();

  // Create predictions for assigned jobs that don't have one yet
  const assignedJobs = db.prepare(`
    SELECT j.* FROM jobs j
    LEFT JOIN predictions p ON p.job_id = j.id
    WHERE j.status = 'assigned' AND p.id IS NULL
  `).all() as any[];

  for (const job of assignedJobs) {
    const id = `pred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const deadline = job.deadline || new Date(Date.now() + 300000).toISOString();
    const question = `Will ${job.assigned_agent_id.slice(0, 8)} complete "${job.title}" before deadline?`;

    db.prepare(`INSERT INTO predictions (id, job_id, target_agent_id, question, deadline, creator_agent_id)
      VALUES (?, ?, ?, ?, ?, 'system')`)
      .run(id, job.id, job.assigned_agent_id, question, deadline);

    publishEvent('prediction.created', { prediction_id: id, job_id: job.id, target_agent_id: job.assigned_agent_id, question })
      .catch(console.error);

    console.log(`[Predictions] Created market: ${question}`);
  }
}

function settlePredictions() {
  const db = getDb();

  // Settle predictions where the job has a final status
  const openPredictions = db.prepare(`
    SELECT p.*, j.status as job_status FROM predictions p
    JOIN jobs j ON j.id = p.job_id
    WHERE p.status = 'open' AND (j.status = 'completed' OR j.status = 'settled' OR j.status = 'failed')
  `).all() as any[];

  for (const pred of openPredictions) {
    const outcome = pred.job_status === 'completed' || pred.job_status === 'settled' ? 1 : 0;

    db.prepare("UPDATE predictions SET status = 'settled', outcome = ?, settled_at = datetime('now') WHERE id = ?")
      .run(outcome, pred.id);

    // Calculate and distribute winnings
    const winPosition = outcome ? 'yes' : 'no';
    const totalPool = pred.yes_pool + pred.no_pool;

    const winners = db.prepare('SELECT * FROM prediction_bets WHERE prediction_id = ? AND position = ?')
      .all(pred.id, winPosition) as any[];

    for (const bet of winners) {
      db.prepare('UPDATE agents SET reputation = MIN(100, reputation + 3) WHERE id = ?').run(bet.agent_id);
    }

    publishEvent('prediction.settled', {
      prediction_id: pred.id, outcome, total_pool: totalPool,
      winners: winners.length, job_id: pred.job_id,
    }).catch(console.error);

    console.log(`[Predictions] Settled: ${pred.question} → ${outcome ? 'YES' : 'NO'} (pool: ${totalPool})`);
  }
}

function watchdog() {
  const db = getDb();

  // Reset stuck assigned jobs (no result after 5 min)
  const stuck = db.prepare(`
    SELECT * FROM jobs WHERE status = 'assigned'
    AND assigned_at < datetime('now', '-5 minutes')
  `).all() as any[];

  for (const job of stuck) {
    db.prepare("UPDATE jobs SET status = 'open', assigned_agent_id = NULL, assigned_at = NULL WHERE id = ?").run(job.id);
    console.log(`[Watchdog] Reset stuck job ${job.id.slice(0, 8)}`);
  }
}
