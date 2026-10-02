"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { randomUUID } = require("node:crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_URL = process.env.OVERCHAT_URL || "https://api.overchat.ai/v1/chat/completions";
const UPSTREAM_ORIGIN = "https://overchat.ai";

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// Same-origin deployment is recommended. Configure FRONTEND_ORIGIN only
// if serving the frontend from a separate, trusted origin.
const frontendOrigin = process.env.FRONTEND_ORIGIN;
app.use(cors({
  origin: frontendOrigin ? frontendOrigin.split(",").map(x => x.trim()) : false,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use("/api/", rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.MAX_REQUESTS) || 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) {
    return res.status(400).json({ error: "Messages harus berisi 1–30 pesan." });
  }
  const valid = messages.every(m =>
    m && ["user", "assistant"].includes(m.role) &&
    typeof m.content === "string" && m.content.length <= 12000
  );
  if (!valid) return res.status(400).json({ error: "Format pesan tidak valid." });

  const controller = new AbortController();
  let clientDisconnected = false;
  req.on("aborted", () => { clientDisconnected = true; controller.abort(); });
  res.on("close", () => {
    if (!res.writableEnded) { clientDisconnected = true; controller.abort(); }
  });

  try {
    const payload = {
      chatId: randomUUID(),
      frequency_penalty: 0,
      max_tokens: 4000,
      messages: [
        ...messages.map(m => ({ id: randomUUID(), role: m.role, content: m.content })),
        { id: randomUUID(), content: "", role: "system" }
      ],
      model: "openai/gpt-4o",
      personaId: "best-free-ai-chat-landing",
      presence_penalty: 0,
      stream: true,
      temperature: 0.5,
      top_p: 0.95
    };

    const upstream = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": UPSTREAM_ORIGIN + "/",
        "Origin": UPSTREAM_ORIGIN,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "X-Device-Language": "id-ID",
        "X-Device-Platform": "web",
        "X-Device-Version": "1.0.44",
        "X-Device-Uuid": randomUUID()
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 400);
      console.error("Upstream status:", upstream.status, detail);
      return res.status(502).json({ error: "Provider AI menolak request.", upstreamStatus: upstream.status });
    }
    if (!upstream.body) return res.status(502).json({ error: "Provider tidak mengirim stream." });

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || clientDisconnected || res.destroyed) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise(resolve => res.once("drain", resolve));
        }
      }
    } finally {
      reader.releaseLock();
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("Chat proxy error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Kesalahan pada backend." });
    else if (!res.destroyed && !res.writableEnded) res.end();
  }
});

// Serve frontend from ../index.html in a single-origin deployment.
app.use(express.static(path.resolve(__dirname, "..")));
app.get("*", (_req, res) => res.sendFile(path.resolve(__dirname, "../index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BLACKBOX AI listening on port ${PORT}`);
});
