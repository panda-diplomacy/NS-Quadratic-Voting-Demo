import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, "state.json");

interface Contribution {
  userId: string;
  votes: number;
  weight: number;
}

interface GlobalState {
  proposals: {
    [optionId: string]: Contribution[];
  };
  vetoes: {
    userId: string;
    weight: number;
  }[];
  participants: {
    [userId: string]: number; // userId -> weight
  };
  isClosed: boolean;
  finalAllocations?: {
    [optionId: string]: number;
  };
}

const INITIAL_OPTIONS = ['cafe', 'snack-bar', 'scooters', 'dance', 'claude'];

const QF_POOL = 25000;
const TARGET_BUDGETS: Record<string, number> = {
  'cafe': 7000,
  'snack-bar': 10000,
  'scooters': 7500,
  'dance': 6500,
  'claude': 9400
};

function calculateAllocations(state: GlobalState) {
  const results: Record<string, { score: number, allocation: number }> = {};
  let totalVotesAcrossAll = 0;

  INITIAL_OPTIONS.forEach(id => {
    const contributions = state.proposals[id] || [];
    const totalVotes = contributions.reduce((sum, c) => sum + c.votes, 0);
    results[id] = { score: totalVotes, allocation: 0 };
    totalVotesAcrossAll += totalVotes;
  });

  if (totalVotesAcrossAll > 0) {
    INITIAL_OPTIONS.forEach(id => {
      // Linear allocation: (Votes for project / Total votes across all) * Pool
      results[id].allocation = (results[id].score / totalVotesAcrossAll) * QF_POOL;
    });
  }

  return results;
}

function rebalanceBudget(state: GlobalState) {
  console.log("Starting rebalanceBudget waterfall...");
  const votesPerProject: Record<string, number> = {};
  INITIAL_OPTIONS.forEach(id => {
    const votes = (state.proposals[id] || []).reduce((sum, c) => sum + c.votes, 0);
    votesPerProject[id] = votes;
    console.log(`Project ${id}: ${votes} total votes`);
  });

  // Sort projects by total votes descending
  const sortedIds = [...INITIAL_OPTIONS].sort((a, b) => votesPerProject[b] - votesPerProject[a]);
  console.log("Sorted projects for waterfall:", sortedIds);
  
  const allocations: Record<string, number> = {};
  INITIAL_OPTIONS.forEach(id => allocations[id] = 0);
  
  let remainingPool = QF_POOL;
  console.log(`Initial pool: $${remainingPool}`);
  
  // Waterfall allocation: Fill most favored projects first up to their target budget
  for (const id of sortedIds) {
    const target = TARGET_BUDGETS[id];
    const give = Math.min(remainingPool, target);
    allocations[id] = give;
    remainingPool -= give;
    console.log(`Allocated $${give} to ${id} (Target: $${target}). Remaining pool: $${remainingPool}`);
    if (remainingPool <= 0) break;
  }

  console.log("Final waterfall allocations:", allocations);
  return allocations;
}

function loadGlobalState(): GlobalState {
  let state: GlobalState = {
    proposals: {},
    vetoes: [],
    participants: {},
    isClosed: false
  };

  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      const loaded = JSON.parse(data);
      state = { ...state, ...loaded };
    }
  } catch (err) {
    console.error("Error loading state file:", err);
  }

  // Ensure all options exist in proposals
  INITIAL_OPTIONS.forEach(id => {
    if (!state.proposals[id]) {
      state.proposals[id] = [];
    }
  });

  return state;
}

function saveGlobalState(state: GlobalState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Error saving state file:", err);
  }
}

let globalState = loadGlobalState();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Voting live on port ${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "SYNC", data: globalState }));

    ws.on("message", (message: string) => {
      try {
        const payload = JSON.parse(message);
        console.log("Received message type:", payload.type);
        
        if (payload.type === "VOTE") {
          if (globalState.isClosed) {
            console.log("VOTE rejected: Budget is closed.");
            return;
          }
          const { userId, allocations, weight, vetoed } = payload.data;
          console.log(`Processing vote from ${userId} with weight ${weight}. Allocations:`, allocations);
          
          if (!userId) {
            console.error("VOTE rejected: Missing userId.");
            return;
          }

          // Update participant weight
          globalState.participants[userId] = weight;

          // Clear existing contributions for this user
          Object.keys(globalState.proposals).forEach(id => {
            if (globalState.proposals[id]) {
              const beforeCount = globalState.proposals[id].length;
              globalState.proposals[id] = globalState.proposals[id].filter(c => c.userId !== userId);
              const afterCount = globalState.proposals[id].length;
              if (beforeCount !== afterCount) {
                console.log(`Cleared previous votes for ${userId} in ${id}`);
              }
            }
          });

          // Update allocations
          let addedCount = 0;
          Object.entries(allocations || {}).forEach(([optionId, votes]) => {
            const voteCount = Number(votes);
            if (voteCount > 0) {
              // Ensure the option exists in proposals
              if (!globalState.proposals[optionId]) {
                globalState.proposals[optionId] = [];
              }
              globalState.proposals[optionId].push({ userId, votes: voteCount, weight });
              addedCount++;
              console.log(`Added ${voteCount} votes for ${userId} to ${optionId}`);
            }
          });

          console.log(`Total options voted for by ${userId}: ${addedCount}`);

          // Update veto
          globalState.vetoes = globalState.vetoes.filter(v => v.userId !== userId);
          if (vetoed) {
            globalState.vetoes.push({ userId, weight });
          }
          
          saveGlobalState(globalState);
          
          const updateMsg = JSON.stringify({ type: "SYNC", data: globalState });
          console.log("Broadcasting SYNC to", wss.clients.size, "clients");
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(updateMsg);
            }
          });
        }

        if (payload.type === "CLOSE_BUDGET") {
          console.log("CLOSE_BUDGET requested with password:", payload.password);
          if (payload.password === "Rome") {
            console.log("Password correct. Closing budget...");
            globalState.isClosed = true;
            globalState.finalAllocations = rebalanceBudget(globalState);
            console.log("Final Allocations calculated:", globalState.finalAllocations);
            saveGlobalState(globalState);
            
            const updateMsg = JSON.stringify({ type: "SYNC", data: globalState });
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(updateMsg);
              }
            });
          } else {
            console.log("Incorrect password provided.");
          }
        }

        if (payload.type === "RESET") {
          globalState = loadGlobalState();
          globalState.proposals = {};
          INITIAL_OPTIONS.forEach(id => globalState.proposals[id] = []);
          globalState.vetoes = [];
          globalState.participants = {};
          globalState.isClosed = false;
          delete globalState.finalAllocations;
          saveGlobalState(globalState);
          
          const updateMsg = JSON.stringify({ type: "SYNC", data: globalState });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(updateMsg);
            }
          });
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

startServer();
