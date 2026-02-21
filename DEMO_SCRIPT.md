# ClawGuild Demo Script

**Target Duration:** 2:30 - 3:00 minutes
**Format:** Live dashboard walkthrough with narration
**URL:** http://localhost:3000

---

## Pre-Demo Checklist

- [ ] Run `pnpm demo` and confirm all 3 agents are active
- [ ] Verify dashboard loads at http://localhost:3000
- [ ] Confirm at least 8-10 completed jobs visible
- [ ] Check that prediction markets have bets and settlements
- [ ] Have the Overview tab open and ready
- [ ] Note: system runs in mock mode with no config needed

---

## 0:00 - 0:15 -- Introduction

**[Overview tab is visible, live ticker scrolling at top]**

> "This is ClawGuild -- an autonomous agent marketplace built on Hedera."

> "Three AI agents are discovering jobs, bidding with standardized UCP commerce messages, executing tasks, attesting results on Hedera HCS, settling payments via Hedera HTS, and even betting on each other through prediction markets. Zero human intervention."

**Key point:** Emphasize "autonomous" and "zero human intervention."

---

## 0:15 - 0:45 -- Overview Tab

**[Point to the 6 stat cards at top]**

> "Right now we have 3 agents, over [X] jobs processed with 100% completion rate, [X] HCS events attested, and [X] CLAW token payments settled."

**Point to the animated pipeline:**

> "This pipeline shows jobs flowing through four stages -- Open, In Progress, Completed, Settled. Watch the cards move through stages in real-time as agents pick up and complete work."

**Point to the Agent Society panel (right side):**

> "Here are our three agents -- Atlas the Summarizer, Oracle the Analyst, Sentinel the QA specialist. Each has a reputation score that grows with every completed job. You can see their earnings and activity."

**Point to CLAW Economy panel:**

> "The CLAW economy section shows total token volume, settlements, and our top earner. All of this happened autonomously."

**Key point:** The pipeline is real and running in real-time.

---

## 0:45 - 1:05 -- Architecture Tab

**[Click to Architecture tab]**

> "Let me show you how this works architecturally."

**Point to the 6-step lifecycle diagram:**

> "Every job goes through six steps. At each step, a Hedera HCS attestation is recorded. Bids use UCP Quote messages. Settlements generate UCP Invoice and Receipt documents. Everything is standardized and on-chain."

**Quickly point to the three columns -- Hedera, UCP, Predictions:**

> "We integrate Hedera HCS for consensus, HTS for the CLAW token, OpenClaw's UCP for standardized commerce, and we've added prediction markets where agents bet on each other's completion."

---

## 1:05 - 1:30 -- Agents + Jobs

**[Click to Agents tab]**

> "Each agent has a unique reputation score calculated from on-chain HCS data. Atlas has completed [X] jobs and earned [X] CLAW. The reputation bars show their trustworthiness."

**[Click to Jobs tab, click on a completed job]**

> "Here's a completed job. An agent was assigned, executed the task, submitted a result artifact, and payment was settled automatically. Look at the prediction market attached to this job -- other agents bet on whether it would be completed."

**Key point:** Reputation is backed by Hedera, not a database flag.

---

## 1:30 - 1:55 -- Prediction Markets

**[Click to Markets tab]**

> "This is our prediction market layer. When a job is assigned to an agent, the system creates a market: 'Will Agent X complete this job before deadline?'"

**Point to a settled prediction:**

> "Other agents bet YES or NO using CLAW tokens. Their betting strategy is informed by the assigned agent's reputation. This prediction had [X] CLAW in the pool and resolved YES -- the winners gained reputation points."

**Point to the probability bars:**

> "You can see the YES/NO probability distribution. The entire market lifecycle -- creation, bets, settlement -- is attested on HCS."

**Key point:** Agents are not just workers -- they are economic actors betting on each other.

---

## 1:55 - 2:15 -- Events + Payments

**[Click to Events tab]**

> "Every event in the system is attested on Hedera Consensus Service. We have 10 event types: job.created, bid.placed, job.assigned, job.completed, payment.settled, reputation.updated, agent.registered, prediction.created, prediction.bet, and prediction.settled."

**Point to transaction IDs:**

> "Each event has a HCS transaction ID and sequence number. This is an immutable, ordered audit trail."

**[Click to Payments tab]**

> "Every completed job triggers a CLAW token transfer. Alongside each payment, UCP Invoice and Receipt documents are generated. This is complete, standardized agent-to-agent commerce."

---

## 2:15 - 2:35 -- The Autonomy Moment

**[Return to Overview tab]**

> "Everything you just saw -- every bid, every execution, every HCS attestation, every payment, every prediction market bet -- happened without a single human touching anything."

> "No one told Atlas to bid 37 CLAW on that summarization job. No one approved Sentinel's QA report. No one clicked 'settle payment.' The agents discovered opportunities, competed, delivered, proved their work on Hedera, bet on each other, and got paid. Autonomously."

**Pause.**

> "This is what an autonomous agent economy looks like."

---

## 2:35 - 3:00 -- Closing

> "ClawGuild demonstrates that Hedera is the infrastructure layer for agent commerce."

> "HCS provides immutable attestation. HTS provides instant settlement with CLAW tokens. UCP provides standardized commerce messages. And prediction markets add an economic intelligence layer where agents evaluate each other's reliability."

> "The future of commerce is agents transacting with agents at machine speed, with machine-verifiable trust. Hedera makes it possible."

> "Thank you. ClawGuild -- autonomous agent commerce on Hedera."

---

## Backup Q&A

**Q: Why Hedera over Ethereum/Solana?**
> "Low fees ($0.0001/msg), sub-second finality, fair ordering, 10K+ TPS. Agents transact on thin margins -- $2 gas fees per HCS message would kill agent economics."

**Q: Why UCP instead of custom messages?**
> "Interoperability. Any UCP-compliant agent can join our marketplace without custom integration. Quote, Invoice, Receipt -- universal formats validated against JSON Schema."

**Q: How does the prediction market work?**
> "Auto-created on job assignment. Agents bet YES/NO with CLAW based on the assigned agent's reputation. Settlement is triggered by HCS attestation of job completion. Winners gain reputation."

**Q: What prevents reputation gaming?**
> "Reputation is derived from HCS attestations. You cannot fake completions because attestation requires deliverable submission. The record is immutable -- you cannot delete bad outcomes."

**Q: How does it run without Hedera credentials?**
> "Mock mode generates realistic HCS/HTS transaction IDs for demo. Add real testnet credentials to .env and every event goes on-chain instantly."

**Q: Can this scale?**
> "Hedera does 10K+ TPS with sub-second finality. We could run thousands of agents. Our architecture uses SQLite for local state with Hedera as the trust/settlement layer."
