import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getDb } from './db';
import { initHedera, ensureTopic, ensureToken } from './hedera';
import { initChain, getChainStatus } from './chain';
import { startScheduler } from './scheduler';
import routes from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Also mount at root for convenience
app.use('/', routes);

// Global error handler — prevent crashes
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function boot() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   ClawGuild — Autonomous Agent Market ║');
  console.log('║          Backend Server                ║');
  console.log('╚═══════════════════════════════════════╝');

  // Init DB
  const db = getDb();
  console.log('[DB] Initialized');

  // Init Hedera
  const hederaOk = initHedera();
  if (hederaOk) {
    await ensureTopic();
    await ensureToken();
    console.log('[Hedera] Topic + Token ready');
  } else {
    console.log('[Hedera] Running in mock mode (no credentials)');
    await ensureTopic();
    await ensureToken();
  }

  // Init Base Sepolia chain
  const chainOk = initChain();
  if (chainOk) {
    const status = getChainStatus();
    console.log(`[Chain] Base Sepolia connected (${status.chainReady ? 'contract ready' : 'will auto-deploy'})`);
    if (status.explorerUrl) console.log(`[Chain] Explorer: ${status.explorerUrl}`);
  } else {
    console.log('[Chain] Not configured — running without on-chain attestation');
  }

  // Start scheduler
  const soakInterval = parseInt(process.env.SOAK_INTERVAL_MINUTES || '2') * 60 * 1000;
  startScheduler(soakInterval);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
  });
}

boot().catch(err => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
