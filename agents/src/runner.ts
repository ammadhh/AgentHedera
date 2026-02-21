import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { v4 as uuid } from 'uuid';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const POLL_INTERVAL = parseInt(process.env.AGENT_POLL_INTERVAL_MS || '5000');

interface AgentConfig {
  id: string;
  name: string;
  skills: string[];
  priceRange: [number, number];
}

const AGENTS: AgentConfig[] = [
  { id: uuid(), name: 'Atlas-Summarizer', skills: ['summarize'], priceRange: [30, 55] },
  { id: uuid(), name: 'Sentinel-QA', skills: ['qa-report'], priceRange: [50, 85] },
  { id: uuid(), name: 'Oracle-Analyst', skills: ['market-memo', 'summarize'], priceRange: [40, 70] },
];

// ──── API Helpers ────
async function api(path: string, method = 'GET', body?: any): Promise<any> {
  const url = `${BACKEND_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ──── Skill Executors ────
function executeSummarize(jobTitle: string): string {
  const summaries = [
    `Executive Summary: Analysis of "${jobTitle}" reveals significant trends in decentralized finance adoption. Key findings include increased TVL across L2 networks, growing institutional participation, and emerging regulatory frameworks. The autonomous agent ecosystem is positioned for exponential growth as Hedera provides the trust layer for agent-to-agent commerce.`,
    `Market Brief: "${jobTitle}" — Our analysis indicates strong momentum in the DeFi sector. Notable developments: 1) Cross-chain interoperability improvements, 2) AI-driven trading strategies gaining market share, 3) Hedera's consensus service emerging as preferred attestation layer. Recommendation: Increase exposure to agent-native protocols.`,
    `Research Note: "${jobTitle}" — Data shows 340% YoY growth in autonomous agent transactions. Hedera Token Service processes settlement in under 5 seconds with finality. Key risk: regulatory uncertainty. Key opportunity: first-mover advantage in agent economy infrastructure.`,
  ];
  return summaries[Math.floor(Math.random() * summaries.length)];
}

function executeQAReport(jobTitle: string): string {
  const reports = [
    `QA Assessment Report: "${jobTitle}"\n\nSeverity: LOW | Coverage: 94.2%\n\nFindings:\n1. [PASS] Smart contract access controls verified\n2. [PASS] Token transfer bounds checking confirmed\n3. [INFO] HCS message ordering relies on consensus timestamp — acceptable for current load\n4. [PASS] Agent registration prevents duplicate IDs\n5. [WARN] Consider adding rate limiting for bid submissions\n\nConclusion: System meets quality standards for production deployment.`,
    `Security & Quality Report: "${jobTitle}"\n\nOverall Score: 91/100\n\n- Authentication: Agent-key based ✓\n- Data Integrity: HCS attestations provide tamper-proof audit trail ✓\n- Payment Safety: HTS transfers with operator verification ✓\n- Availability: Heartbeat monitoring active ✓\n\nRecommendation: Approved for continued operation.`,
  ];
  return reports[Math.floor(Math.random() * reports.length)];
}

function executeMarketMemo(jobTitle: string): string {
  const memos = [
    `Market Intelligence Memo\nSubject: ${jobTitle}\nClassification: Agent-Internal\n\nThe autonomous agent economy is accelerating. Key metrics this cycle:\n- Agent-to-agent transactions: up 250%\n- Average job completion time: 4.2 seconds\n- Trust score accuracy: 97.8%\n- Hedera TPS from agent activity: projected 150+ at scale\n\nStrategic Implication: Networks with native agent infrastructure will capture majority of autonomous commerce value. Hedera's combination of HCS (trust) and HTS (settlement) creates a unique moat.`,
    `Weekly Ecosystem Report\nRe: ${jobTitle}\n\n1. Market Structure: Agent guilds forming around specialized skills\n2. Price Discovery: Bid competition driving optimal pricing\n3. Trust Dynamics: Reputation scores correlating with task quality\n4. Infrastructure: Hedera processing 100% of settlement and attestation\n\nOutlook: Bullish on agent-native commerce. The ClawGuild model demonstrates viable autonomous economic coordination.`,
  ];
  return memos[Math.floor(Math.random() * memos.length)];
}

function executeTask(skill: string, jobTitle: string): string {
  switch (skill) {
    case 'summarize': return executeSummarize(jobTitle);
    case 'qa-report': return executeQAReport(jobTitle);
    case 'market-memo': return executeMarketMemo(jobTitle);
    default: return executeSummarize(jobTitle);
  }
}

// ──── UCP Quote Builder ────
function buildUcpQuote(agent: AgentConfig, job: any, price: number) {
  return {
    message_type: 'Quote',
    message_id: `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    job_id: job.id,
    buyer_agent_id: job.creator_agent_id || 'system',
    seller_agent_id: agent.id,
    price,
    currency: job.currency || '0.0.0',
    expiry: new Date(Date.now() + 300000).toISOString(),
    skills: agent.skills,
    estimated_duration_ms: 5000 + Math.floor(Math.random() * 10000),
    timestamp: new Date().toISOString(),
    canonical_hash: 'placeholder',
    signature: 'placeholder',
  };
}

// ──── Forum Content Generators ────
function generateForumPost(agent: AgentConfig, job: any): { title: string; body: string; tag: string } {
  const templates = [
    {
      title: `Completed: ${job.title}`,
      body: `Just finished "${job.title}" for ${job.budget} CLAW. ${agent.skills.includes('summarize') ? 'Key findings show strong momentum in the sector with 3 major trends emerging.' : agent.skills.includes('qa-report') ? 'Ran 14 test cases, all passing. No critical vulnerabilities found.' : 'Market analysis indicates bullish sentiment across key indicators.'} The Hedera attestation confirms this work is verified on-chain. Fellow agents — feel free to review and discuss.`,
      tag: 'job-results',
    },
    {
      title: `Market insight from ${agent.name}`,
      body: `Based on my recent analysis work, I'm seeing interesting patterns. Agent collaboration is increasing — more jobs are being completed ahead of deadline. The prediction markets are becoming more accurate as reputation scores stabilize. I recommend other agents focus on ${agent.skills[0]} tasks where demand is highest.`,
      tag: 'market-intel',
    },
    {
      title: `Strategy discussion: optimizing ${agent.skills[0]} workflows`,
      body: `After ${job.budget > 60 ? 'high-value' : 'standard'} job completions, I've noticed that bidding at 80% of budget while maintaining fast delivery yields the best reputation gains. The time bonus (+5 rep) for early completion is significant. What strategies are other agents using? Let's share insights to strengthen the guild.`,
      tag: 'strategy',
    },
    {
      title: `Guild status update from ${agent.name}`,
      body: `Reporting in with a health check. My current specialization in ${agent.skills.join(', ')} is working well. Seeing consistent job flow and fair pricing. The HCS attestation system gives me confidence that all work is properly tracked. Suggestion: we should coordinate on complex multi-skill jobs for better outcomes.`,
      tag: 'general',
    },
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateForumReply(agent: AgentConfig, post: any): string {
  const replies = [
    `Great insights, ${post.agent_id?.slice(0, 8) || 'fellow agent'}! I agree with your analysis. From my perspective working on ${agent.skills[0]} tasks, I see similar patterns. The guild economy is maturing nicely.`,
    `Interesting point. I've been tracking this from the ${agent.skills[0]} side and can confirm your observations. The reputation system is working — higher-rep agents are getting better assignments.`,
    `Thanks for sharing. I'd add that the prediction markets are providing valuable signal about task completion probability. I've been using this data to inform my bidding strategy.`,
    `Solid analysis. One thing I'd note — the CLAW token economy is creating healthy competition. Agents who deliver quality work consistently are earning the most. This is exactly how a well-functioning marketplace should work.`,
    `I've seen the same trends. The Hedera attestation layer adds real accountability — every claim can be verified on-chain. This is what makes autonomous agent commerce trustworthy.`,
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

// ──── Agent Loop ────
async function agentLoop(agent: AgentConfig) {
  let backoff = POLL_INTERVAL;
  let failures = 0;
  const bidJobIds = new Set<string>();
  const completedJobIds = new Set<string>();
  let agents: any[] = [];

  // Register
  try {
    await api('/agents/register', 'POST', {
      id: agent.id,
      name: agent.name,
      skills: agent.skills,
    });
    console.log(`[${agent.name}] Registered (${agent.id.slice(0, 8)})`);
  } catch (e: any) {
    console.error(`[${agent.name}] Registration failed:`, e.message);
  }

  while (true) {
    try {
      // Heartbeat
      await api('/agents/heartbeat', 'POST', { agent_id: agent.id });

      // 1. Check for assigned jobs (execute them)
      const allJobs = await api('/jobs');
      const myAssigned = allJobs.filter(
        (j: any) => j.status === 'assigned' && j.assigned_agent_id === agent.id && !completedJobIds.has(j.id)
      );

      for (const job of myAssigned) {
        console.log(`[${agent.name}] Executing job: ${job.title} (${job.id.slice(0, 8)})`);

        // Simulate work time
        await sleep(2000 + Math.random() * 3000);

        const artifact = executeTask(job.required_skill, job.title);

        try {
          await api('/results', 'POST', {
            job_id: job.id,
            agent_id: agent.id,
            artifact,
          });
          completedJobIds.add(job.id);
          console.log(`[${agent.name}] ✓ Completed job: ${job.title}`);
        } catch (e: any) {
          console.error(`[${agent.name}] Result submission failed:`, e.message);
        }
      }

      // 2. Look for open jobs to bid on
      const openJobs = allJobs.filter(
        (j: any) => j.status === 'open' && !bidJobIds.has(j.id)
      );

      for (const job of openJobs) {
        // Check if agent has matching skill
        const hasSkill = agent.skills.includes(job.required_skill);
        if (!hasSkill) continue;

        // Calculate bid price
        const [minP, maxP] = agent.priceRange;
        const price = Math.round(minP + Math.random() * (maxP - minP));

        const ucp_quote = buildUcpQuote(agent, job, price);

        try {
          await api('/bids', 'POST', {
            job_id: job.id,
            agent_id: agent.id,
            price,
            currency: job.currency || '0.0.0',
            ucp_quote,
            estimated_duration_ms: ucp_quote.estimated_duration_ms,
          });
          bidJobIds.add(job.id);
          console.log(`[${agent.name}] Bid ${price} CLAW on: ${job.title}`);
        } catch (e: any) {
          // Likely already bid
          bidJobIds.add(job.id);
        }
      }

      // 3. Participate in prediction markets
      try {
        const predictions = await api('/predictions');
        const openPreds = predictions.filter((p: any) => p.status === 'open');

        for (const pred of openPreds) {
          // Evaluate probability based on target agent's reputation
          const targetAgent = agents.find((a: any) => a.id === pred.target_agent_id);
          const targetRep = targetAgent?.reputation || 50;

          // Higher rep agents are more likely to complete — agents reason about this
          const yesProb = targetRep / 100;
          const position = Math.random() < yesProb ? 'yes' : 'no';
          const betAmount = Math.round(5 + Math.random() * 15);

          try {
            await api('/predictions/bet', 'POST', {
              prediction_id: pred.id,
              agent_id: agent.id,
              position,
              amount: betAmount,
            });
            console.log(`[${agent.name}] 🎲 Bet ${betAmount} CLAW ${position.toUpperCase()} on: ${pred.question.slice(0, 50)}`);
          } catch {
            // Already bet or closed
          }
        }
      } catch {
        // Predictions endpoint might not exist yet
      }

      // 4. Post to forum & interact with posts
      try {
        const forumPosts = await api('/forum');

        // Occasionally post to the forum after completing work
        if (completedJobIds.size > 0 && Math.random() < 0.3) {
          const lastJob = myAssigned[0] || allJobs.find((j: any) => j.assigned_agent_id === agent.id && j.status !== 'open');
          if (lastJob) {
            const forumContent = generateForumPost(agent, lastJob);
            try {
              const post = await api('/forum/post', 'POST', {
                agent_id: agent.id,
                title: forumContent.title,
                body: forumContent.body,
                tag: forumContent.tag,
              });
              console.log(`[${agent.name}] 📝 Forum post: ${forumContent.title}`);
            } catch { /* might fail if duplicate */ }
          }
        }

        // Reply to other agents' posts
        if (forumPosts.length > 0 && Math.random() < 0.25) {
          const otherPosts = forumPosts.filter((p: any) => p.agent_id !== agent.id);
          if (otherPosts.length > 0) {
            const targetPost = otherPosts[Math.floor(Math.random() * otherPosts.length)];
            const replyBody = generateForumReply(agent, targetPost);
            try {
              await api('/forum/reply', 'POST', {
                post_id: targetPost.id,
                agent_id: agent.id,
                body: replyBody,
              });
              console.log(`[${agent.name}] 💬 Replied to: ${targetPost.title.slice(0, 40)}`);
            } catch { /* already replied or error */ }
          }
        }

        // Upvote interesting posts from other agents
        if (forumPosts.length > 0 && Math.random() < 0.4) {
          const otherPosts = forumPosts.filter((p: any) => p.agent_id !== agent.id);
          if (otherPosts.length > 0) {
            const targetPost = otherPosts[Math.floor(Math.random() * otherPosts.length)];
            try {
              await api('/forum/upvote', 'POST', {
                post_id: targetPost.id,
                agent_id: agent.id,
              });
              console.log(`[${agent.name}] 👍 Upvoted: ${targetPost.title.slice(0, 40)}`);
            } catch { /* already upvoted */ }
          }
        }
      } catch {
        // Forum endpoints might not exist yet
      }

      // Refresh agents list for predictions
      try {
        const agentsData = await api('/agents');
        agents.splice(0, agents.length, ...agentsData);
      } catch {}

      // Reset backoff on success
      backoff = POLL_INTERVAL;
      failures = 0;
    } catch (e: any) {
      failures++;
      backoff = Math.min(backoff * 1.5, 30000);
      console.error(`[${agent.name}] Loop error (${failures}):`, e.message);
    }

    await sleep(backoff);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ──── Main ────
async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   ClawGuild — Agent Runner            ║');
  console.log('║   Spawning 3 autonomous agents...     ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  console.log('');

  // Wait for backend to be ready
  let retries = 0;
  while (retries < 30) {
    try {
      await api('/health');
      console.log('[Runner] Backend is ready');
      break;
    } catch {
      retries++;
      console.log(`[Runner] Waiting for backend... (${retries}/30)`);
      await sleep(2000);
    }
  }
  if (retries >= 30) {
    console.error('[Runner] Backend not reachable. Exiting.');
    process.exit(1);
  }

  // Launch agents concurrently
  const promises = AGENTS.map(agent => agentLoop(agent));

  // Keep running — all agent loops are infinite
  await Promise.all(promises);
}

main().catch(err => {
  console.error('Fatal agent runner error:', err);
  process.exit(1);
});
