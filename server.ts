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
}

const INITIAL_OPTIONS = ['cafe', 'snack-bar', 'scooters', 'dance', 'claude'];

function loadGlobalState(): GlobalState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading state file:", err);
  }

  const state: GlobalState = {
    proposals: {},
    vetoes: [],
    participants: {}
  };
  INITIAL_OPTIONS.forEach(id => {
    state.proposals[id] = [];
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
        
        if (payload.type === "VOTE") {
          const { userId, allocations, weight, vetoed } = payload.data;
          
          // Update participant weight
          globalState.participants[userId] = weight;

          // Clear existing contributions for this user
          Object.keys(globalState.proposals).forEach(id => {
            globalState.proposals[id] = globalState.proposals[id].filter(c => c.userId !== userId);
          });

          // Update allocations
          Object.entries(allocations).forEach(([optionId, votes]) => {
            const voteCount = Number(votes);
            if (globalState.proposals[optionId] !== undefined && voteCount > 0) {
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
