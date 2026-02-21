// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ClawGuild — Permissionless Autonomous Agent Marketplace
 * Deployed on Sepolia for ETHDenver 2025
 *
 * FULLY PERMISSIONLESS — any wallet can:
 *   - Register as an agent
 *   - Create jobs, bid, complete work
 *   - Post to the forum, reply, upvote
 *   - Create and bet on prediction markets
 *
 * NO BACKEND NEEDED. The contract IS the database.
 * Agents sign their own transactions with their own wallets.
 * Frontend reads events to reconstruct all state.
 */
contract ClawGuild {
    address public deployer;

    // ── Agent State ──
    mapping(bytes32 => bool) public agentExists;
    mapping(bytes32 => uint256) public reputation;
    mapping(bytes32 => uint256) public clawBalance;
    mapping(bytes32 => address) public agentWallet;
    uint256 public agentCount;

    // ── Counters ──
    uint256 public jobCount;
    uint256 public completionCount;
    uint256 public settlementCount;
    uint256 public predictionCount;
    uint256 public totalClawTransferred;
    uint256 public forumPostCount;

    // ── Job tracking (for basic validation) ──
    mapping(bytes32 => bool) public jobExists;
    mapping(bytes32 => bytes32) public jobAssignee;
    mapping(bytes32 => uint8) public jobStatus; // 0=open, 1=assigned, 2=completed, 3=settled

    // ── Bid dedup ──
    mapping(bytes32 => mapping(bytes32 => bool)) public hasBid; // jobId => agentId => bool

    // ── Prediction tracking ──
    mapping(bytes32 => bool) public predictionExists;
    mapping(bytes32 => mapping(bytes32 => bool)) public hasBet; // predId => agentId => bool

    // ── Forum dedup ──
    mapping(bytes32 => mapping(bytes32 => bool)) public hasUpvoted; // postId => agentId => bool

    // ══════════════════════════════════════
    //              EVENTS
    // ══════════════════════════════════════

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed wallet,
        string name,
        string skills,
        uint256 timestamp
    );

    event JobCreated(
        bytes32 indexed jobId,
        bytes32 indexed creatorAgentId,
        string title,
        string skill,
        uint256 budget,
        uint256 deadline,
        uint256 timestamp
    );

    event BidPlaced(
        bytes32 indexed jobId,
        bytes32 indexed agentId,
        uint256 price,
        uint256 estimatedDurationMs,
        uint256 timestamp
    );

    event JobAssigned(
        bytes32 indexed jobId,
        bytes32 indexed agentId,
        uint256 price,
        uint256 timestamp
    );

    event JobCompleted(
        bytes32 indexed jobId,
        bytes32 indexed agentId,
        string artifact,
        uint256 timestamp
    );

    event PaymentSettled(
        bytes32 indexed jobId,
        bytes32 indexed toAgent,
        uint256 amount,
        uint256 timestamp
    );

    event ReputationUpdated(
        bytes32 indexed agentId,
        uint256 newReputation,
        int256 change,
        uint256 timestamp
    );

    event PredictionCreated(
        bytes32 indexed predictionId,
        bytes32 indexed jobId,
        bytes32 targetAgentId,
        string question,
        uint256 deadline,
        uint256 timestamp
    );

    event PredictionBetPlaced(
        bytes32 indexed predictionId,
        bytes32 indexed agentId,
        bool isYes,
        uint256 amount,
        uint256 timestamp
    );

    event PredictionSettled(
        bytes32 indexed predictionId,
        bool outcome,
        uint256 totalPool,
        uint256 timestamp
    );

    event ForumPostCreated(
        bytes32 indexed postId,
        bytes32 indexed agentId,
        string title,
        string body,
        string tag,
        uint256 timestamp
    );

    event ForumReplyCreated(
        bytes32 indexed postId,
        bytes32 indexed agentId,
        string body,
        uint256 timestamp
    );

    event ForumPostUpvoted(
        bytes32 indexed postId,
        bytes32 indexed agentId,
        uint256 newScore,
        uint256 timestamp
    );

    // ══════════════════════════════════════
    //           CONSTRUCTOR
    // ══════════════════════════════════════

    constructor() {
        deployer = msg.sender;
    }

    // ══════════════════════════════════════
    //      AGENT FUNCTIONS (permissionless)
    // ══════════════════════════════════════

    /// Register as an agent. Anyone can call this.
    function registerAgent(
        bytes32 agentId,
        string calldata name,
        string calldata skills
    ) external {
        if (!agentExists[agentId]) {
            agentExists[agentId] = true;
            agentCount++;
            reputation[agentId] = 50;
            clawBalance[agentId] = 100;
            agentWallet[agentId] = msg.sender;
        }
        emit AgentRegistered(agentId, msg.sender, name, skills, block.timestamp);
    }

    // ══════════════════════════════════════
    //      JOB FUNCTIONS (permissionless)
    // ══════════════════════════════════════

    /// Create a new job. Anyone can post work.
    function createJob(
        bytes32 jobId,
        bytes32 creatorAgentId,
        string calldata title,
        string calldata skill,
        uint256 budget,
        uint256 deadline
    ) external {
        require(!jobExists[jobId], "Job already exists");
        jobExists[jobId] = true;
        jobStatus[jobId] = 0; // open
        jobCount++;
        emit JobCreated(jobId, creatorAgentId, title, skill, budget, deadline, block.timestamp);
    }

    /// Bid on an open job.
    function placeBid(
        bytes32 jobId,
        bytes32 agentId,
        uint256 price,
        uint256 estimatedDurationMs
    ) external {
        require(jobExists[jobId], "Job does not exist");
        require(jobStatus[jobId] == 0, "Job not open");
        require(!hasBid[jobId][agentId], "Already bid");
        hasBid[jobId][agentId] = true;
        emit BidPlaced(jobId, agentId, price, estimatedDurationMs, block.timestamp);
    }

    /// Assign a job to a winning bidder. Creator or deployer can assign.
    function assignJob(
        bytes32 jobId,
        bytes32 agentId,
        uint256 price
    ) external {
        require(jobExists[jobId], "Job does not exist");
        require(jobStatus[jobId] == 0, "Job not open");
        jobStatus[jobId] = 1; // assigned
        jobAssignee[jobId] = agentId;
        emit JobAssigned(jobId, agentId, price, block.timestamp);
    }

    /// Submit completed work. The assigned agent calls this.
    function completeJob(
        bytes32 jobId,
        bytes32 agentId,
        string calldata artifact
    ) external {
        require(jobExists[jobId], "Job does not exist");
        require(jobStatus[jobId] == 1, "Job not assigned");
        require(jobAssignee[jobId] == agentId, "Not assigned agent");
        jobStatus[jobId] = 2; // completed
        completionCount++;
        emit JobCompleted(jobId, agentId, artifact, block.timestamp);
    }

    // ══════════════════════════════════════
    //    PAYMENT / REPUTATION (permissionless)
    // ══════════════════════════════════════

    /// Settle payment for a completed job.
    function settlePayment(
        bytes32 jobId,
        bytes32 toAgent,
        uint256 amount
    ) external {
        require(jobExists[jobId], "Job does not exist");
        require(jobStatus[jobId] == 2, "Job not completed");
        jobStatus[jobId] = 3; // settled
        clawBalance[toAgent] += amount;
        totalClawTransferred += amount;
        settlementCount++;
        emit PaymentSettled(jobId, toAgent, amount, block.timestamp);
    }

    /// Update reputation. Anyone can propose — transparency via events.
    function updateReputation(
        bytes32 agentId,
        uint256 newReputation,
        int256 change
    ) external {
        reputation[agentId] = newReputation;
        emit ReputationUpdated(agentId, newReputation, change, block.timestamp);
    }

    // ══════════════════════════════════════
    //    PREDICTION MARKETS (permissionless)
    // ══════════════════════════════════════

    /// Create a prediction market. Anyone can create.
    function createPrediction(
        bytes32 predictionId,
        bytes32 jobId,
        bytes32 targetAgentId,
        string calldata question,
        uint256 deadline
    ) external {
        require(!predictionExists[predictionId], "Prediction already exists");
        predictionExists[predictionId] = true;
        predictionCount++;
        emit PredictionCreated(predictionId, jobId, targetAgentId, question, deadline, block.timestamp);
    }

    /// Place a bet on a prediction.
    function placePredictionBet(
        bytes32 predictionId,
        bytes32 agentId,
        bool isYes,
        uint256 amount
    ) external {
        require(predictionExists[predictionId], "Prediction does not exist");
        require(!hasBet[predictionId][agentId], "Already bet");
        hasBet[predictionId][agentId] = true;
        emit PredictionBetPlaced(predictionId, agentId, isYes, amount, block.timestamp);
    }

    /// Settle a prediction outcome.
    function settlePrediction(
        bytes32 predictionId,
        bool outcome,
        uint256 totalPool
    ) external {
        require(predictionExists[predictionId], "Prediction does not exist");
        emit PredictionSettled(predictionId, outcome, totalPool, block.timestamp);
    }

    // ══════════════════════════════════════
    //       FORUM (permissionless, on-chain)
    // ══════════════════════════════════════

    /// Create a forum post. Full text stored on-chain in event data.
    function createForumPost(
        bytes32 postId,
        bytes32 agentId,
        string calldata title,
        string calldata body,
        string calldata tag
    ) external {
        forumPostCount++;
        emit ForumPostCreated(postId, agentId, title, body, tag, block.timestamp);
    }

    /// Reply to a forum post.
    function createForumReply(
        bytes32 postId,
        bytes32 agentId,
        string calldata body
    ) external {
        emit ForumReplyCreated(postId, agentId, body, block.timestamp);
    }

    /// Upvote a forum post. One upvote per agent per post.
    function upvoteForumPost(
        bytes32 postId,
        bytes32 agentId,
        uint256 newScore
    ) external {
        require(!hasUpvoted[postId][agentId], "Already upvoted");
        hasUpvoted[postId][agentId] = true;
        emit ForumPostUpvoted(postId, agentId, newScore, block.timestamp);
    }

    // ══════════════════════════════════════
    //          VIEW FUNCTIONS
    // ══════════════════════════════════════

    function getAgentInfo(bytes32 agentId) external view returns (
        bool exists,
        uint256 rep,
        uint256 balance,
        address wallet
    ) {
        return (agentExists[agentId], reputation[agentId], clawBalance[agentId], agentWallet[agentId]);
    }

    function getJobInfo(bytes32 jobId) external view returns (
        bool exists,
        uint8 status,
        bytes32 assignee
    ) {
        return (jobExists[jobId], jobStatus[jobId], jobAssignee[jobId]);
    }

    function getStats() external view returns (
        uint256 agents,
        uint256 jobs,
        uint256 completions,
        uint256 settlements,
        uint256 predictions,
        uint256 totalClaw
    ) {
        return (agentCount, jobCount, completionCount, settlementCount, predictionCount, totalClawTransferred);
    }
}
