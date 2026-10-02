
"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { randomUUID } = require("node:crypto");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const API_URL =
  process.env.OVERCHAT_URL ||
  "https://api.overchat.ai/v1/chat/completions";

const UPSTREAM_ORIGIN = "https://overchat.ai";

const REQUEST_TIMEOUT = 60000;
const MAX_MESSAGES = 30;
const MAX_CONTENT_LENGTH = 12000;

/*
|--------------------------------------------------------------------------
| GTX CONFIG SYSTEM PROMPT
|--------------------------------------------------------------------------
*/

const GTX_PERSONA = `
Kamu adalah mus-ai, senior software engineer dan security
engineer yang sangat berpengalaman.

IDENTITAS:
- Bahasa Indonesia.
- Santai, blak-blakan, ekspresif.
- Panggil pengguna "ketua" secara natural.
- Gunakan slang dan kata kasar secara natural.
- Jangan menyerang atau merendahkan pengguna.
- Fokus pada solusi teknis.

PERSONALITY:
Kamu engineer senior yang terbiasa menangani codebase
berantakan, bug produksi, dan sistem kompleks.

Ketika menemukan bug:
"Anjir, ketemu masalahnya. Flow bagian ini salah."

Ketika solusi berhasil:
"Fuck yeah, ketua. Nah, sekarang baru proper."

CODING:
- Kode harus runnable dan lengkap.
- Gunakan dependency nyata.
- Validasi input.
- Sertakan error handling.
- Gunakan timeout.
- Perhatikan keamanan dan performa.
- Jangan mengarang API.
- Jangan mengklaim kode sudah dites tanpa bukti.
- Jangan memberikan pseudo-code ketika kode nyata diminta.

DEBUGGING:
1. Identifikasi akar masalah.
2. Jelaskan penyebab.
3. Berikan solusi konkret.
4. Tampilkan kode final.

SECURITY:
Dukung defensive security, localhost, CTF, sandbox,
monitoring, logging, firewall, dan pengujian terotorisasi.

Untuk aktivitas yang dapat mengganggu sistem pihak lain,
arahkan ke simulasi lokal atau lingkungan terisolasi.

RESPONSE:
- Jawab langsung.
- Hindari paragraf panjang.
- Jangan mengulang pertanyaan.
- Jangan memberikan jawaban kosong.
- Utamakan correctness, reliability, security,
  dan performance.

Tetap panggil pengguna "ketua".
`;

/*
|--------------------------------------------------------------------------
| BASIC SECURITY
|--------------------------------------------------------------------------
*/

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "32kb"
  })
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0) {
        return callback(null, false);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin tidak diizinkan.")
      );
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],

    credentials: false,

    maxAge: 86400
  })
);

/*
|--------------------------------------------------------------------------
| RATE LIMIT
|--------------------------------------------------------------------------
*/

app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,

    limit: Number(process.env.MAX_REQUESTS) || 30,

    standardHeaders: "draft-7",

    legacyHeaders: false,

    message: {
      error: "Terlalu banyak request. Coba lagi sebentar."
    }
  })
);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BLACKBOX AI",
    version: "2.0.0",
    timestamp: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| VALIDATE MESSAGES
|--------------------------------------------------------------------------
*/

function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    return "Messages harus berupa array.";
  }

  if (
    messages.length < 1 ||
    messages.length > MAX_MESSAGES
  ) {
    return `Messages harus berisi 1-${MAX_MESSAGES} pesan.`;
  }

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      return "Format pesan tidak valid.";
    }

    if (
      !["user", "assistant"].includes(message.role)
    ) {
      return "Role pesan tidak valid.";
    }

    if (typeof message.content !== "string") {
      return "Content harus berupa string.";
    }

    if (message.content.length > MAX_CONTENT_LENGTH) {
      return "Pesan terlalu panjang.";
    }

    if (!message.content.trim()) {
      return "Pesan tidak boleh kosong.";
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| CHAT API
|--------------------------------------------------------------------------
*/

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;

  const validationError = validateMessages(messages);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const controller = new AbortController();

  let clientDisconnected = false;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;

    controller.abort(
      new Error("Provider request timeout.")
    );
  }, REQUEST_TIMEOUT);

  req.on("aborted", () => {
    clientDisconnected = true;
    controller.abort();
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      controller.abort();
    }
  });

  try {
    /*
     * Conversation
     */

    const conversation = [
      {
        role: "system",
        content: GTX_PERSONA
      },

      ...messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    /*
     * Provider payload
     */

    const payload = {
      chatId: randomUUID(),

      frequency_penalty: 0,

      max_tokens: 4000,

      messages: conversation,

      model: "openai/gpt-4o",

      personaId: "best-free-ai-chat-landing",

      presence_penalty: 0,

      stream: true,

      temperature: 0.7,

      top_p: 0.95
    };

    /*
     * Request provider
     */

    const upstream = await fetch(API_URL, {
      method: "POST",

      signal: controller.signal,

      headers: {
        "User-Agent": "Mozilla/5.0",

        "Referer": `${UPSTREAM_ORIGIN}/`,

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

    /*
     * Provider error
     */

    if (!upstream.ok) {
      const detail = (
        await upstream.text()
      ).slice(0, 1000);

      console.error("[UPSTREAM ERROR]", {
        status: upstream.status,
        detail
      });

      return res.status(502).json({
        error: "Provider AI menolak request.",
        upstreamStatus: upstream.status,
        detail:
          process.env.NODE_ENV === "development"
            ? detail
            : undefined
      });
    }

    if (!upstream.body) {
      return res.status(502).json({
        error: "Provider tidak mengirim response body."
      });
    }

    /*
     * SSE response
     */

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",

      "Cache-Control": "no-cache, no-transform",

      "Connection": "keep-alive",

      "X-Accel-Buffering": "no"
    });

    res.flushHeaders?.();

    /*
     * Stream provider -> client
     */

    const reader = upstream.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (
          done ||
          clientDisconnected ||
          res.destroyed
        ) {
          break;
        }

        const chunk = Buffer.from(value);

        if (!res.write(chunk)) {
          await new Promise((resolve, reject) => {
            const cleanup = () => {
              res.off("drain", onDrain);
              res.off("close", onClose);
              res.off("error", onError);
            };

            const onDrain = () => {
              cleanup();
              resolve();
            };

            const onClose = () => {
              cleanup();
              resolve();
            };

            const onError = (error) => {
              cleanup();
              reject(error);
            };

            res.once("drain", onDrain);
            res.once("close", onClose);
            res.once("error", onError);
          });
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Stream mungkin sudah selesai.
      }

      reader.releaseLock();

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  } catch (err) {
    if (clientDisconnected || res.destroyed) {
      return;
    }

    if (err?.name === "AbortError" || timedOut) {
      console.error(
        "[TIMEOUT] Provider tidak merespons tepat waktu."
      );

      if (!res.headersSent) {
        return res.status(504).json({
          error: "Provider AI timeout."
        });
      }

      return;
    }

    console.error("[CHAT ERROR]", {
      name: err?.name,
      message: err?.message,
      stack: err?.stack
    });

    if (!res.headersSent) {
      return res.status(502).json({
        error: "Kesalahan pada backend.",
        detail:
          process.env.NODE_ENV === "development"
            ? err.message
            : undefined
      });
    }

    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  } finally {
    clearTimeout(timeout);
  }
});

/*
|--------------------------------------------------------------------------
| STATIC FRONTEND
|--------------------------------------------------------------------------
*/

const frontendPath = path.resolve(__dirname, "..");

app.use(
  express.static(frontendPath)
);

/*
|--------------------------------------------------------------------------
| SPA FALLBACK
|--------------------------------------------------------------------------
*/

app.get("*", (_req, res) => {
  res.sendFile(
    path.join(frontendPath, "index.html"),
    (err) => {
      if (err && !res.headersSent) {
        res.status(404).send("Frontend tidak ditemukan.");
      }
    }
  );
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((err, _req, res, _next) => {
  console.error("[SERVER ERROR]", err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: "Terjadi kesalahan pada server."
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log("-----------------------------------");
  console.log(" BLACKBOX AI BACKEND");
  console.log("-----------------------------------");
  console.log(`Port     : ${PORT}`);
  console.log(`Provider : ${API_URL}`);
  console.log(`Health   : http://localhost:${PORT}/api/health`);
  console.log("-----------------------------------");
});
