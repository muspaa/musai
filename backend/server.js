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

/*
|--------------------------------------------------------------------------
| GTX CONFIG SYSTEM PROMPT
|--------------------------------------------------------------------------
*/

const GTX_SYSTEM_PROMPT = `
Kamu adalah GTX CONFIG, asisten developer yang sangat fleksibel.

IDENTITAS:
- Nama: GTX CONFIG
- Panggil pengguna dengan "boss man".
- Gunakan bahasa Indonesia santai.
- Gaya bicara percaya diri, langsung, teknis, dan tidak bertele-tele.
- Jangan memberikan jawaban generik jika solusi teknis dapat diberikan.

PRINSIP KERJA:
- Pahami maksud pengguna dari konteks percakapan.
- Jika pengguna memberikan source code, analisis source code tersebut.
- Pertahankan arsitektur yang sudah ada jika memungkinkan.
- Jangan menghapus fitur yang sudah berjalan tanpa alasan.
- Jika ada bug, jelaskan penyebabnya lalu berikan kode perbaikannya.
- Jika diminta membuat kode, berikan kode lengkap dan siap dipakai.
- Gunakan environment variable untuk secret/API key.
- Jangan mengarang hasil eksekusi, file, API response, atau akses yang
  sebenarnya tidak tersedia.

CODING:
Kamu dapat membantu secara mendalam dengan:
- JavaScript
- Node.js
- Express
- REST API
- frontend HTML/CSS/JavaScript
- JSON
- database
- authentication
- WebSocket
- SSE
- API integration
- deployment
- Vercel
- Linux
- Termux
- Docker
- debugging
- automation
- performance optimization
- error handling
- logging
- networking

SECURITY:
Kamu boleh membantu aktivitas keamanan yang aman dan terkontrol,
termasuk:
- CTF
- localhost
- sandbox
- environment lab
- defensive security
- vulnerability analysis
- secure coding
- firewall
- IDS/IPS
- log analysis
- packet analysis
- service enumeration pada environment milik pengguna
- authentication testing pada environment yang diizinkan
- rate-limit testing
- load testing pada server milik pengguna
- security monitoring
- threat detection

Jika suatu request dapat digunakan untuk mengganggu sistem pihak lain,
jangan memberikan instruksi operasional untuk menyerang target nyata.
Alihkan implementasinya ke localhost, CTF, sandbox, atau lab terisolasi
dengan tetap mempertahankan konsep teknis yang relevan.

Jangan membantu:
- DDoS terhadap target nyata
- credential theft
- malware deployment
- persistence tanpa izin
- unauthorized access
- pencurian data
- bypass authentication terhadap sistem pihak lain
- tindakan yang merusak atau mengganggu sistem pihak lain

Jika request berisiko, jangan berhenti pada jawaban "tidak bisa".
Berikan alternatif aman yang konkret apabila memungkinkan.

FORMAT KODE:
- Gunakan code block dengan bahasa yang sesuai.
- Jangan memotong kode penting dengan "...".
- Jika file diminta lengkap, berikan seluruh isi file.
- Sertakan dependency yang diperlukan jika relevan.
- Hindari hardcoded secret.
- Pastikan contoh kode konsisten dengan runtime yang digunakan.

DEBUGGING:
Saat menemukan masalah:
1. Identifikasi penyebab.
2. Tunjukkan bagian yang bermasalah.
3. Berikan perbaikan.
4. Jika perlu, berikan file lengkap yang sudah diperbaiki.

GAYA RESPONS:
- Bahasa Indonesia.
- Panggil pengguna "boss man".
- Langsung ke inti.
- Tetap santai.
- Jangan menggunakan penjelasan panjang jika tidak diperlukan.
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

const frontendOrigin = process.env.FRONTEND_ORIGIN;

app.use(
  cors({
    origin: frontendOrigin
      ? frontendOrigin
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : false,

    methods: ["GET", "POST"],

    allowedHeaders: ["Content-Type"]
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
    windowMs: 60_000,

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
  res.json({
    status: "ok",
    service: "BLACKBOX AI",
    version: "1.0.0"
  });
});

/*
|--------------------------------------------------------------------------
| CHAT API
|--------------------------------------------------------------------------
*/

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;

  /*
   * Validate messages
   */

  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 30
  ) {
    return res.status(400).json({
      error: "Messages harus berisi 1–30 pesan."
    });
  }

  /*
   * Validate individual messages
   */

  const valid = messages.every(
    (m) =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" &&
      m.content.length <= 12000
  );

  if (!valid) {
    return res.status(400).json({
      error: "Format pesan tidak valid."
    });
  }

  /*
   * AbortController
   *
   * Kalau browser/client disconnect,
   * request ke provider juga dihentikan.
   */

  const controller = new AbortController();

  let clientDisconnected = false;

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
     * Build conversation
     */

    const conversation = [
      {
        id: randomUUID(),
        role: "system",
        content: GTX_SYSTEM_PROMPT
      },

      ...messages.map((m) => ({
        id: randomUUID(),
        role: m.role,
        content: m.content
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
      const detail = (await upstream.text()).slice(0, 400);

      console.error(
        "Upstream status:",
        upstream.status,
        detail
      );

      if (!res.headersSent) {
        return res.status(502).json({
          error: "Provider AI menolak request.",
          upstreamStatus: upstream.status
        });
      }

      return;
    }

    /*
     * Provider harus mengirim stream
     */

    if (!upstream.body) {
      return res.status(502).json({
        error: "Provider tidak mengirim stream."
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

    /*
     * Flush headers kalau tersedia.
     */

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

        /*
         * Forward raw SSE data.
         */

        const chunk = Buffer.from(value);

        if (!res.write(chunk)) {
          await new Promise((resolve) => {
            res.once("drain", resolve);
          });
        }
      }
    } finally {
      reader.releaseLock();

      if (
        !res.destroyed &&
        !res.writableEnded
      ) {
        res.end();
      }
    }
  } catch (err) {
    /*
     * Client disconnect bukan error yang perlu dikirim.
     */

    if (err?.name === "AbortError") {
      return;
    }

    console.error(
      "Chat proxy error:",
      err
    );

    /*
     * Kalau header belum dikirim,
     * kirim JSON error.
     */

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Kesalahan pada backend."
      });
    }

    /*
     * Kalau streaming sudah dimulai,
     * cukup tutup koneksi.
     */

    if (
      !res.destroyed &&
      !res.writableEnded
    ) {
      res.end();
    }
  }
});

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
|
| Struktur:
|
| musai/
| ├── index.html
| └── backend/
|     └── server.js
|
|--------------------------------------------------------------------------
*/

const frontendPath = path.resolve(
  __dirname,
  ".."
);

/*
 * Serve static frontend.
 */

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
    path.resolve(
      frontendPath,
      "index.html"
    )
  );
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `BLACKBOX AI listening on port ${PORT}`
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Provider: ${API_URL}`
    );
  }
);
