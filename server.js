import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { api } from "./server/api.js";
import { db } from "./server/db.js";
import { attachOcpp } from "./server/ocpp.js";
import { paymentsApi } from "./server/payments.js";
import { pushApi, attachPush } from "./server/push.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const distDir = join(__dirname, "dist");

app.disable("x-powered-by");

// Health-check для Render
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// REST API + live-синхронизация (SSE)
// Payme / Click merchant callbacks and top-up orders.
app.use("/api/payments", paymentsApi);
// Web Push subscriptions.
app.use("/api/push", pushApi);
app.use("/api", api);

// Статика собранного Vite-приложения
app.use(express.static(distDir));

// SPA fallback — любой не-API маршрут отдаёт index.html
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(join(distDir, "index.html"));
});

// Load the database before accepting traffic, so no request sees empty state.
await db.ready;

const server = app.listen(PORT, () => {
  console.log(`ONE CHARGE UZ running on port ${PORT}`);
});

// OCPP 1.6-J charge points connect over WebSocket on the same port.
attachOcpp(server);
attachPush();

// Render sends SIGTERM on every deploy; flush pending writes before exiting.
let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${reason} — flushing and shutting down`);
  server.close();
  try {
    await db.close();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// Windows has no real SIGTERM for child processes; tests ask over IPC instead.
if (process.send) process.on("message", m => m === "shutdown" && shutdown("IPC shutdown"));
