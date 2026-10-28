import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { api } from "./server/api.js";
import { db } from "./server/db.js";
import { attachOcpp } from "./server/ocpp.js";
import { paymentsApi } from "./server/payments.js";
import { pushApi, attachPush } from "./server/push.js";
import { startWebhookWorker } from "./server/webhooks.js";
import { startDemoLife } from "./server/demoLife.js";
import { ocpiApi, registerPartner, ourUrls } from "./server/ocpi.js";
import { mockCpo } from "./scripts/ocpi-cpo-mock.mjs";
import { sandboxPayout } from "./server/direct.js";
import { networkApi } from "./server/networkApi.js";
import { startSessionWatch } from "./server/sessionWatch.js";
import "./server/cameras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const distDir = join(__dirname, "dist");

app.disable("x-powered-by");
// Render terminates TLS in front of us; trust one hop so req.ip is the client.
app.set("trust proxy", 1);

// Health-check для Render
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// REST API + live-синхронизация (SSE)
// Payme / Click merchant callbacks and top-up orders.
app.use("/api/payments", paymentsApi);
// Web Push subscriptions.
app.use("/api/push", pushApi);
// Networks without OCPI push their stations and charges here.
app.use("/api/network/v1", networkApi);
app.use("/api", api);
// OCPI 2.2.1: partner networks call us here (we are the eMSP).
app.use("/ocpi", ocpiApi);

// The demo includes one partner network connected over OCPI, so the whole
// roaming flow can be seen without a real partner.
const DEMO_LIFE = process.env.DEMO_MODE !== "false" && process.env.DEMO_SIMULATION !== "false";
const demoCpo = DEMO_LIFE && process.env.OCPI_DEMO !== "false" ? mockCpo({ base: `http://127.0.0.1:${PORT}/demo-cpo` }) : null;
if (demoCpo) app.use("/demo-cpo", demoCpo.router);

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
  console.log(`Zaryad24 running on port ${PORT}`);
  if (demoCpo) connectDemoPartner();
});

/** Connects the demo partner once; after a restart both sides pick up the credentials they already share. */
async function connectDemoPartner() {
  const known = (db.data.ocpiPartners ?? []).find(p => p.versionsUrl === demoCpo.versionsUrl && p.status === "connected");
  if (known) {
    const op = db.byId("operators", known.operatorId);
    if (op && !op.payout) sandboxPayout(op);
    return demoCpo.restore({ tokenB: known.tokenB, versionsUrl: ourUrls(known.base).versions, tokenC: known.tokenC });
  }
  const r = await registerPartner({ versionsUrl: demoCpo.versionsUrl, token: demoCpo.tokenA, base: `http://127.0.0.1:${PORT}` });
  console.log(r.error ? `[ocpi] demo partner: ${r.error}` : `[ocpi] demo partner connected · ${r.synced} stations`);
  // Paid directly, through a sandbox cashbox: the whole money trail runs without charging anyone.
  const op = r.partner && db.byId("operators", r.partner.operatorId);
  if (op) sandboxPayout(op);
}

// OCPP 1.6-J charge points connect over WebSocket on the same port.
attachOcpp(server);
attachPush();
// Charge goals, progress notices and scheduled starts.
startSessionWatch();
startWebhookWorker();
// The demo network keeps charging on its own; tests turn this off.
if (DEMO_LIFE) startDemoLife();

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
