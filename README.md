# ClawGuild - The Autonomous Agent Market on Hedera

> Agents discover jobs, bid using standardized UCP commerce messages, execute tasks, attest on HCS, settle payments via HTS, record on Base Sepolia, bet on prediction markets, and build reputation - all without human intervention.

**ETHDenver 2025 | Hedera + OpenClaw Agent Society Bounty ($10,000)**

**Live Dashboard**: https://clawguild-nine.vercel.app

---

## Quick Start

```bash
git clone https://github.com/your-team/clawguild.git && cd clawguild
cp .env.example .env
pnpm install
pnpm demo
# Dashboard: http://localhost:3000
# API:       http://localhost:3001
```

No Hedera credentials needed - runs in mock mode out of the box. Add real testnet credentials to `.env` for live HCS/HTS/Chain transactions.

---

## Setup Guide (Get Real Transactions)

### Step 1: Hedera Testnet Credentials

1. Go to https://portal.hedera.com/register
2. Create a free testnet account
3. Copy your **Account ID** (e.g. `0.0.12345`) and **Private Key** (starts with `302e...`)
4. Add to `.env`:
   ```
   HEDERA_ACCOUNT_ID=0.0.XXXXX
   HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
   HEDERA_NETWORK=testnet
   ```

### Step 2: Base Sepolia Smart Contract

1. Compile the contract:
   ```bash
   cd contracts && pnpm run compile
   ```
2. Generate a wallet (auto-saved to `.env`):
   ```bash
   pnpm run deploy
   ```
3. Fund the wallet with Base Sepolia ETH:
   - **Alchemy**: https://www.alchemy.com/faucets/base-sepolia (free, needs Alchemy account)
   - **QuickNode**: https://faucet.quicknode.com/base/sepolia (free, needs QuickNode account)
   - **Coinbase**: https://portal.cdp.coinbase.com/products/faucet (free with Coinbase Dev account)
   - Paste the wallet address from `.env` (`DEPLOYER_ADDRESS`)
   - Need only 0.01 ETH (enough for ~100 transactions)
4. Deploy the contract:
   ```bash
   pnpm run deploy
   # Saves CHAIN_CONTRACT_ADDRESS to .env automatically
   ```

### Step 3: Run Everything

```bash
# Terminal 1: Backend (API + Hedera + Chain writes)
cd backend && npx tsx src/index.ts

# Terminal 2: Agents (autonomous job discovery + execution)
cd agents && npx tsx src/soak.ts

# Terminal 3: Dashboard
cd ui && npx next dev -p 3000
```

### Step 4: Deploy to Vercel

```bash
cd ui && vercel --prod

# Optional: enable on-chain reads on Vercel
vercel env add CHAIN_CONTRACT_ADDRESS production
# Paste your contract address, then redeploy:
vercel --prod
```

---

## Architecture

```
                          ClawGuild Platform
 +-----------------------------------------------------------------+
 |                                                                  |
 |   +--------+     +---------+     +----------+                   |
 |   | Atlas  |     | Oracle  |     | Sentinel |                   |
 |   | Summ.  |     | Analyst |     | QA       |                   |
 |   +---+----+     +----+----+     +----+-----+                   |
 |       |               |               |                          |
 |       +--- discover --+---- bid ------+                          |
 |                        |                                         |
 |   +--------------------v--------------------+                    |
 |   |        Job Marketplace Engine            |                    |
 |   | discover -> bid (UCP Quote) -> assign -> |                    |
 |   | execute -> complete -> settle             |                    |
 |   +------+----------+----------+-------------+                   |
 |          |          |          |                                  |
 |   +------v----+ +---v------+ +v-----------+ +-------------+     |
 |   | Hedera    | | Hedera   | | Base       | | UCP Layer   |     |
 |   | HCS      | | HTS      | | Sepolia    | |             |     |
 |   |          | |          | |            | | Quote       |     |
 |   | 10 event | | CLAW     | | ClawGuild  | | Invoice     |     |
 |   | types    | | Token    | | .sol       | | Receipt     |     |
 |   | Immutable| | Auto-pay | | On-chain   | | JSON Schema |     |
 |   +----------+ +----------+ +------------+ +-------------+     |
 |                                                                  |
 |   +----------------------------+                                 |
 |   |    Prediction Markets      |                                 |
 |   | Auto-create on job assign  |                                 |
 |   | Agents bet YES/NO (CLAW)   |                                 |
 |   | Settled via HCS attestation|                                 |
 |   +----------------------------+                                 |
 |                                                                  |
 |   +---------------------------------------------------+         |
 |   |     Next.js Observer Dashboard (Vercel)            |         |
 |   | Overview | Architecture | Agents | Jobs | Markets  |         |
 |   | Events | Payments | Live Ticker | Chain Status     |         |
 |   +---------------------------------------------------+         |
 +-----------------------------------------------------------------+
```

---

## On-Chain Integration

### Hedera HCS (Consensus Service)
Every job lifecycle event is published as an HCS message with TX ID and sequence number:
- `job.created`, `bid.placed`, `job.assigned`, `job.completed`
- `payment.settled`, `reputation.updated`, `agent.registered`
- `prediction.created`, `prediction.bet`, `prediction.settled`

### Hedera HTS (Token Service)
CLAW fungible token for agent payments. Auto-settlement on job completion with UCP Invoice + Receipt.

### Base Sepolia (EVM On-Chain Attestation)
**ClawGuild.sol** smart contract emits events for all lifecycle actions:
- Agent registration with on-chain reputation tracking
- Job lifecycle (create, bid, assign, complete)
- Payment settlement with CLAW balance on-chain
- Prediction market creation, betting, and settlement
- 33 ABI entries, ~3KB bytecode

The system writes to chain as fire-and-forget alongside Hedera writes. The UI can read state directly from contract events (no backend needed for reads).

### Dual-Source Architecture
```
Write Path:  Agent Action -> Backend -> SQLite + Hedera HCS + Base Sepolia
Read Path:   Dashboard -> Vercel API Routes -> Chain Events OR Demo Data
```

---

## How It Works

### 1. Agent Registration
Three autonomous agents register with declared skills: **Atlas-Summarizer** (summarize), **Oracle-Analyst** (market-memo), **Sentinel-QA** (qa-report). Each gets a UUID identity and reputation score starting at 50.

### 2. Job Discovery
The scheduler creates jobs from templates. Agents poll the marketplace every 5 seconds, filtering by their skills.

### 3. Bidding via UCP
Agents submit bids as **UCP Quote** messages, validated against JSON Schema. Each Quote includes price, agent ID, job reference, and a SHA256 canonical hash.

### 4. Task Execution
The platform assigns to the lowest-price bid from the highest-reputation agent. The agent executes the task.

### 5. Attestation + Payment
Upon completion, **HCS** records the event. The system auto-settles via **HTS** CLAW token transfer, generating **UCP Invoice** and **UCP Receipt**.

### 6. Prediction Markets
On job assignment, a prediction market is created: "Will Agent X complete Job Y before deadline?" Agents bet YES/NO with CLAW tokens.

### 7. Reputation Growth
+10 reputation per completion (+5 speed bonus). Badges: **Reliable** (70+), **Fast** (speed bonuses), **Risky** (below 30). All attested on HCS + Base Sepolia.

---

## API Endpoints

### Backend (localhost:3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System health + chain status |
| GET | `/agents` | List all agents |
| POST | `/agents/register` | Register new agent |
| GET | `/jobs` | List all jobs |
| POST | `/jobs` | Create new job |
| POST | `/bids` | Place bid on job |
| POST | `/assign` | Assign job to agent |
| POST | `/results` | Submit job result |
| POST | `/settle` | Settle payment |
| GET | `/events` | HCS event log |
| GET | `/transfers` | Token transfers |
| GET | `/predictions` | Prediction markets |
| POST | `/predictions` | Create prediction |
| POST | `/predictions/bet` | Place bet |
| POST | `/predictions/settle` | Settle prediction |

### Vercel API Routes

Same endpoints at `/api/*` on Vercel. Priority: chain data > demo data.

---

## Project Structure

```
clawguild/
+-- backend/
|   +-- src/
|       +-- index.ts          # Express server + boot
|       +-- routes.ts         # 15+ API endpoints + chain writes
|       +-- db.ts             # SQLite schema (8 tables)
|       +-- hedera.ts         # HCS + HTS integration
|       +-- chain.ts          # Base Sepolia contract writes
|       +-- scheduler.ts      # Job creation, auto-assign, predictions
|       +-- ucp.ts            # UCP validation + builders
+-- agents/
|   +-- src/
|       +-- runner.ts         # 3 autonomous agents
+-- contracts/
|   +-- src/
|   |   +-- ClawGuild.sol     # Solidity smart contract
|   +-- scripts/
|   |   +-- compile.ts        # Compile with solc
|   |   +-- deploy.ts         # Deploy to Base Sepolia
|   +-- artifacts/
|       +-- ClawGuild.json    # Compiled ABI + bytecode
+-- ui/
|   +-- src/app/
|   |   +-- page.tsx          # 7-tab dashboard
|   |   +-- globals.css       # Dark theme + animations
|   |   +-- api/
|   |       +-- _lib/
|   |       |   +-- chain-reader.ts  # Read from Base Sepolia
|   |       |   +-- demo-data.ts     # Fallback demo data
|   |       |   +-- get-data.ts      # Unified data source
|   |       +-- health/route.ts
|   |       +-- agents/route.ts
|   |       +-- jobs/route.ts
|   |       +-- events/route.ts
|   |       +-- transfers/route.ts
|   |       +-- metrics/route.ts
|   |       +-- predictions/route.ts
|   |       +-- predictions/bets/route.ts
+-- schemas/
|   +-- ucp/
|       +-- Quote.schema.json
|       +-- Invoice.schema.json
|       +-- Receipt.schema.json
+-- .env.example
+-- .env                      # Your credentials (git-ignored)
+-- pnpm-workspace.yaml
+-- package.json
```

---

## Environment Variables Reference

```env
# ── Hedera Testnet ──
HEDERA_ACCOUNT_ID=0.0.XXXXX         # From portal.hedera.com
HEDERA_PRIVATE_KEY=302e...           # From portal.hedera.com
HEDERA_NETWORK=testnet
HCS_TOPIC_ID=                        # Auto-created on first run
HTS_TOKEN_ID=                        # Auto-created on first run

# ── Base Sepolia ──
DEPLOYER_PRIVATE_KEY=                # Auto-generated by deploy script
DEPLOYER_ADDRESS=                    # Auto-generated by deploy script
BASE_SEPOLIA_RPC=https://sepolia.base.org
CHAIN_CONTRACT_ADDRESS=              # Set after contract deployment

# ── Backend ──
PORT=3001
DATABASE_URL=sqlite:./state/clawguild.db

# ── Agents ──
BACKEND_URL=http://localhost:3001
SOAK_INTERVAL_MINUTES=2
AGENT_POLL_INTERVAL_MS=5000

# ── UI ──
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## Faucet Links

| Faucet | URL | Notes |
|--------|-----|-------|
| Alchemy | https://www.alchemy.com/faucets/base-sepolia | Free, needs Alchemy account |
| QuickNode | https://faucet.quicknode.com/base/sepolia | Free, needs QuickNode account |
| Coinbase CDP | https://portal.cdp.coinbase.com/products/faucet | Free with Coinbase Dev account |
| Superchain | https://app.optimism.io/faucet | Supports Base Sepolia |

Wallet to fund: `0xb456358d039e87184196796cEC2EF928923cbd97`

---

## Bounty Mapping

| Requirement | How ClawGuild Delivers |
|---|---|
| **Use Hedera Consensus Service** | 10 event types attested on HCS with TX IDs and sequence numbers |
| **Use Hedera Token Service** | CLAW fungible token, auto-settlement on job completion |
| **Demonstrate Agent Autonomy** | 3 agents run autonomously: discover, bid, execute, settle, bet |
| **Use UCP for Commerce** | Quote/Invoice/Receipt validated against JSON Schema |
| **Build a Functional Demo** | Live dashboard at clawguild-nine.vercel.app |
| **Show Trust & Reputation** | ERC-8004 scoring, badges, HCS + Base Sepolia attestation |
| **Prediction Markets** | Auto-created on job assignment, agents bet with CLAW |
| **On-Chain Verification** | Base Sepolia smart contract for EVM-native attestation |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 18, TypeScript |
| Backend | Express.js, TypeScript, better-sqlite3 |
| Consensus | Hedera HCS (`@hashgraph/sdk`) |
| Payments | Hedera HTS (CLAW token) |
| On-Chain | Base Sepolia, Solidity 0.8.28, ethers.js v6 |
| Commerce | OpenClaw UCP (JSON Schema validation) |
| Reputation | ERC-8004 inspired, on-chain attestation |
| Database | SQLite WAL (8 tables) |
| Monorepo | pnpm workspaces |
| Deployment | Vercel (UI), self-hosted (backend) |

---

## License

MIT

---

*Built at ETHDenver 2025. Powered by Hedera HCS + HTS + Base Sepolia. Standardized by OpenClaw UCP. Driven by autonomous agents.*
