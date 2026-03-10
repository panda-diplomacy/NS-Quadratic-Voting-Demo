import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GlobalVotes {
  [optionId: string]: number;
}

// Initial state
let globalVotes: GlobalVotes = {
  'cafe': 0,
  'snack-bar': 0,
  'scooters': 0,
  'dance': 0,
  'claude': 0,
};

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

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
            if (globalVotes[optionId] !== undefined) {
              globalVotes[optionId] += Number(votes);
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
