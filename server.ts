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
  let totalScore = 0;

  INITIAL_OPTIONS.forEach(id => {
    const contributions = state.proposals[id] || [];
    const score = Math.pow(contributions.reduce((sum, c) => sum + c.votes, 0), 2);
    results[id] = { score, allocation: 0 };
    totalScore += score;
  });

  if (totalScore > 0) {
    INITIAL_OPTIONS.forEach(id => {
      results[id].allocation = (results[id].score / totalScore) * QF_POOL;
    });
  }

  return results;
}

function rebalanceBudget(state: GlobalState) {
  const initialResults = calculateAllocations(state);
  const allocations: Record<string, number> = {};
  let excess = 0;

  // 1. Cap at target and collect excess
  INITIAL_OPTIONS.forEach(id => {
    const target = TARGET_BUDGETS[id];
    const initial = initialResults[id].allocation;
    if (initial > target) {
      allocations[id] = target;
      excess += (initial - target);
    } else {
      allocations[id] = initial;
    }
  });

  // 2. Distribute excess to underfunded projects by score descending
  while (excess > 0.01) {
    const underfunded = INITIAL_OPTIONS
      .filter(id => allocations[id] < TARGET_BUDGETS[id])
      .sort((a, b) => initialResults[b].score - initialResults[a].score);

    if (underfunded.length === 0) break;

    const topId = underfunded[0];
    const needed = TARGET_BUDGETS[topId] - allocations[topId];
    const give = Math.min(excess, needed);
    
    allocations[topId] += give;
    excess -= give;
    
    // If we can't give any more to anyone, stop
    if (give === 0) break;
  }

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
          if (globalState.isClosed) return;
          const { userId, allocations, weight, vetoed } = payload.data;
          console.log(`Processing vote from ${userId} with weight ${weight}`);
          
          // Update participant weight
          globalState.participants[userId] = weight;

          // Clear existing contributions for this user
          Object.keys(globalState.proposals).forEach(id => {
            if (globalState.proposals[id]) {
              globalState.proposals[id] = globalState.proposals[id].filter(c => c.userId !== userId);
            }
          });

          // Update allocations
          Object.entries(allocations).forEach(([optionId, votes]) => {
            const voteCount = Number(votes);
            if (voteCount > 0) {
              // Ensure the option exists in proposals
              if (!globalState.proposals[optionId]) {
                globalState.proposals[optionId] = [];
              }
              globalState.proposals[optionId].push({ userId, votes: voteCount, weight });
            }
          });

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
