import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { api } from "./server/api.js";

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
app.use("/api", api);

// Статика собранного Vite-приложения
app.use(express.static(distDir));

// SPA fallback — любой не-API маршрут отдаёт index.html
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`ONE CHARGE UZ running on port ${PORT}`);
});
