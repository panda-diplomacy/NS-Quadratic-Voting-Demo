import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GlobalVotes {
  [optionId: string]: {
    credits: number;
    raw_votes: number;
  };
}

const INITIAL_OPTIONS = ['cafe', 'snack-bar', 'scooters', 'dance', 'claude'];

// Initialize in-memory state
function loadGlobalVotes(): GlobalVotes {
  const votes: GlobalVotes = {};
  INITIAL_OPTIONS.forEach(id => {
    votes[id] = {
      credits: 0,
      raw_votes: 0
    };
  });
  return votes;
}

let globalVotes = loadGlobalVotes();

async function startServer() {
  const app = express();
  
  // 3. Ensure your port is dynamic for the cloud
  const PORT = Number(process.env.PORT) || 3000;
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Voting live on port ${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  // WebSocket logic
  wss.on("connection", (ws: WebSocket) => {
    console.log("Client connected");
    
    // Send initial state to new client
    ws.send(JSON.stringify({ type: "SYNC", data: globalVotes }));

    ws.on("message", (message: string) => {
      try {
        const payload = JSON.parse(message);
        if (payload.type === "VOTE") {
          const { allocations } = payload.data;
          
          // Update global state
          Object.entries(allocations).forEach(([optionId, votes]) => {
            const voteCount = Number(votes);
            const quadraticValue = voteCount * voteCount;
            if (globalVotes[optionId] !== undefined && voteCount > 0) {
              globalVotes[optionId].credits += quadraticValue;
              globalVotes[optionId].raw_votes += voteCount;
            }
          });
          
          // Broadcast update to all clients
          const updateMsg = JSON.stringify({ type: "SYNC", data: globalVotes });
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

    ws.on("close", () => {
      console.log("Client disconnected");
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

startServer();
