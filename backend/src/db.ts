import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL?.replace('sqlite:', '') ||
  path.join(__dirname, '..', '..', 'state', 'clawguild.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      reputation INTEGER NOT NULL DEFAULT 50,
      completions INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      time_bonuses INTEGER NOT NULL DEFAULT 0,
      last_heartbeat TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      required_skill TEXT NOT NULL,
      budget REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT '0.0.0',
      status TEXT NOT NULL DEFAULT 'open',
      creator_agent_id TEXT,
      assigned_agent_id TEXT,
      result_artifact TEXT,
      deadline TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_at TEXT,
      completed_at TEXT,
      hcs_create_seq INTEGER,
      hcs_assign_seq INTEGER,
      hcs_complete_seq INTEGER
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT '0.0.0',
      ucp_quote TEXT NOT NULL,
      estimated_duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      job_id TEXT,
      agent_id TEXT,
      hcs_tx_id TEXT,
      hcs_sequence INTEGER,
      hcs_topic_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      from_agent_id TEXT,
      to_agent_id TEXT NOT NULL,
      amount REAL NOT NULL,
      token_id TEXT NOT NULL,
      hts_tx_id TEXT,
      ucp_invoice TEXT,
      ucp_receipt TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      target_agent_id TEXT NOT NULL,
      question TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      outcome INTEGER,
      yes_pool REAL NOT NULL DEFAULT 0,
      no_pool REAL NOT NULL DEFAULT 0,
      creator_agent_id TEXT,
      hcs_create_seq INTEGER,
      hcs_settle_seq INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS prediction_bets (
      id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      position TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'general',
      upvotes INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      hcs_seq INTEGER,
      chain_tx TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS forum_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      body TEXT NOT NULL,
      hcs_seq INTEGER,
      chain_tx TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES forum_posts(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS forum_upvotes (
      post_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function saveConfig(key: string, value: string) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

export function getConfig(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}
