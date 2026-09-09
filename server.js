import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const distDir = join(__dirname, "dist");

// Health-check для Render
app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Статика собранного Vite-приложения
app.use(express.static(distDir));

// SPA fallback — любой маршрут отдаёт index.html
app.get("*", (_req, res) => {
  res.sendFile(join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`ONE CHARGE UZ running on port ${PORT}`);
});
