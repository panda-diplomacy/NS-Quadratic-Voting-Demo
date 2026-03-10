import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Create a data directory if it doesn't exist
const dataDir = process.env.NODE_ENV === 'production' ? '/var/data' : './';
if (!fs.existsSync(dataDir) && dataDir !== './') {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 2. Point SQLite to the persistent path
const dbPath = path.join(dataDir, 'votes.db');
const db = new Database(dbPath);

// Initialize database table
db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    option_id TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
  )
`);

interface GlobalVotes {
  [optionId: string]: number;
}

const INITIAL_OPTIONS = ['cafe', 'snack-bar', 'scooters', 'dance', 'claude'];

// Initialize options in DB if they don't exist
const insertInitial = db.prepare('INSERT OR IGNORE INTO votes (option_id, count) VALUES (?, 0)');
INITIAL_OPTIONS.forEach(id => insertInitial.run(id));

// Load initial state from DB
function loadGlobalVotes(): GlobalVotes {
  const rows = db.prepare('SELECT option_id, count FROM votes').all() as { option_id: string, count: number }[];
  const votes: GlobalVotes = {};
  rows.forEach(row => {
    votes[row.option_id] = row.count;
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
          
          // Update global state and DB
          const updateStmt = db.prepare('UPDATE votes SET count = count + ? WHERE option_id = ?');
          
          db.transaction(() => {
            Object.entries(allocations).forEach(([optionId, votes]) => {
              const voteCount = Number(votes);
              const quadraticValue = voteCount * voteCount;
              if (globalVotes[optionId] !== undefined && quadraticValue > 0) {
                globalVotes[optionId] += quadraticValue;
                updateStmt.run(quadraticValue, optionId);
              }
            });
          })();
          
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
