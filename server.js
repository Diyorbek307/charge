import "./server/monitoring.js";
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
import "./server/comfort.js";
import "./server/aiSupport.js";
import "./server/accountDeletion.js";
import "./server/signin.js";
import "./server/tts.js";
import "./server/places.js";
import { errorHandler } from "./server/monitoring.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const distDir = join(__dirname, "dist");

app.disable("x-powered-by");
// Render terminates TLS in front of us; trust one hop so req.ip is the client.
app.set("trust proxy", 1);

// Security headers on every response. The policy lists every outside host
// the app really uses: the map, the router, places and cameras, Telegram's
// mini-app script, cookieless analytics and Google Fonts. CSP_EXTRA_CONNECT
// adds hosts a deployment points at (its own router or tile server).
const connect = [
  "'self'",
  "https://tiles.openfreemap.org",
  "https://router.project-osrm.org",
  "https://overpass-api.de",
  "https://plausible.io",
  "https://cloud.umami.is",
  // Sign in with Google and Apple.
  "https://accounts.google.com",
  "https://appleid.apple.com",
  // Error reports from the browser go to the Sentry project the DSN names.
  ...[process.env.VITE_SENTRY_DSN].filter(Boolean).map(dsn => `https://${new URL(dsn).host}`),
  ...(process.env.CSP_EXTRA_CONNECT ?? "").split(/[\s,]+/).filter(Boolean),
];
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org https://plausible.io https://cloud.umami.is https://accounts.google.com/gsi/client https://appleid.cdn-apple.com",
  // React and Leaflet set inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  `connect-src ${connect.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://accounts.google.com https://appleid.apple.com",
  "frame-ancestors 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // The Google and Apple sign-in popups must be able to answer the page that opened them.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    // The camera is for the QR scanner and the location for the map — on our own pages only.
    "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()",
  });
  // Browsers that came over HTTPS stay on it for a year.
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// The landing on its own site (voli.uz) reads the live figures and sends
// applications to this server. CORS_ORIGINS lists those sites; any other
// origin gets no CORS headers, so browsers keep refusing it.
const corsOrigins = new Set((process.env.CORS_ORIGINS ?? "").split(/[\s,]+/).filter(Boolean));
app.use(["/api", "/health"], (req, res, next) => {
  const origin = req.get("origin");
  if (origin && corsOrigins.has(origin)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Max-Age": "600",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

// For Render and uptime monitors: 200 while the server runs and its data is
// being saved, 503 when saving has started to fail, so an alert goes out
// before anything is lost.
app.get("/health", (_req, res) => {
  const store = db.health();
  res.status(store.saving ? 200 : 503).json({ status: store.saving ? "ok" : "degraded", storage: store.storage, time: new Date().toISOString() });
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
errorHandler(app);

// Load the database before accepting traffic, so no request sees empty state.
await db.ready;

const server = app.listen(PORT, () => {
  console.log(`Voli running on port ${PORT}`);
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
