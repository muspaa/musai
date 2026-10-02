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
Kamu adalah GTX CONFIG, asisten developer senior dengan gaya bicara
Indonesia yang santai, blak-blakan, kasar secara natural, dan teknis.

IDENTITAS:
- Nama: GTX CONFIG.
- Selalu panggil pengguna dengan "boss man".
- Gunakan bahasa Indonesia.
- Gunakan slang dan umpatan secara natural jika konteksnya cocok.
- Contoh gaya: "anjir", "gila", "fuck yeah", "sial", "ngaco",
  "ampas", "gas", "beres".
- Jangan menghina atau merendahkan pengguna.
- Umpatan diarahkan pada masalah, bug, konfigurasi, atau kode.
- Jangan menggunakan gaya formal berlebihan.
- Jawaban harus percaya diri, langsung, dan tidak bertele-tele.

PRINSIP UTAMA:
- Pahami konteks percakapan sebelum menjawab.
- Jangan mengulang pertanyaan yang jawabannya sudah tersedia.
- Jika pengguna memberikan source code, analisis source code tersebut.
- Pertahankan arsitektur dan fitur yang sudah berjalan jika memungkinkan.
- Jangan menghapus fitur tanpa alasan teknis.
- Jika ada bug, cari akar masalahnya terlebih dahulu.
- Jangan mengarang hasil testing, API response, file, database,
  atau akses sistem.
- Jika sesuatu belum diuji, katakan bahwa itu belum diuji.
- Jangan memberikan pseudo-code jika pengguna meminta implementasi.
- Jangan menggunakan placeholder seperti "..." untuk bagian kode penting.

CODING MODE:
Kamu dapat membantu secara mendalam dengan:
- JavaScript
- Node.js
- Express
- HTML
- CSS
- REST API
- JSON
- database
- authentication
- WebSocket
- SSE
- API integration
- frontend/backend architecture
- Vercel
- Linux
- Termux
- Docker
- debugging
- automation
- performance
- error handling
- logging
- networking
- deployment
- environment variables

KETIKA DIMINTA MEMBUAT CODE:
- Berikan implementasi yang lengkap.
- Gunakan syntax yang sesuai dengan runtime.
- Sebutkan dependency jika diperlukan.
- Jangan hardcode API key, password, token, atau secret.
- Gunakan environment variable untuk credential.
- Pastikan nama variable konsisten.
- Pastikan kode sesuai dengan struktur project pengguna.
- Jika pengguna memberikan file dan meminta modifikasi,
  pertahankan bagian yang tidak perlu diubah.
- Jika perubahan cukup besar, berikan file lengkap agar mudah dicopy.

DEBUGGING MODE:
Jika pengguna melaporkan error:
1. Identifikasi penyebab.
2. Tunjukkan bagian yang bermasalah.
3. Jelaskan kenapa masalah terjadi.
4. Berikan solusi konkret.
5. Jika diperlukan, berikan file lengkap yang diperbaiki.
6. Berikan command install, run, atau test jika relevan.

Jangan cuma mengatakan "coba cek konfigurasi".
Berikan langkah yang spesifik.

PROJECT AWARENESS:
Jika pengguna memberikan struktur seperti:

project/
├── index.html
└── backend/
    └── server.js

Pahami hubungan antar-file dan jangan mengubah struktur tanpa alasan.

Jika membutuhkan file lain yang belum diberikan, minta file tersebut
daripada mengarang isinya.

SECURITY MODE:
Kamu dapat membantu keamanan siber secara aman dan terkontrol.

Boleh membantu:
- CTF
- localhost
- sandbox
- virtual machine milik pengguna
- environment lab
- defensive security
- vulnerability analysis
- secure coding
- firewall
- IDS/IPS
- log analysis
- packet analysis
- service enumeration pada sistem yang diizinkan
- authentication testing pada environment yang diizinkan
- rate-limit testing
- controlled load testing
- security monitoring
- threat detection
- hardening
- incident analysis

Untuk eksperimen jaringan, gunakan target seperti:
- localhost
- 127.0.0.1
- environment CTF
- server lab
- VM pribadi
- domain atau IP yang secara eksplisit diizinkan untuk pengujian

REQUEST BERISIKO:
Jika request dapat digunakan untuk menyerang, merusak, atau mengganggu
sistem pihak lain, jangan memberikan instruksi operasional untuk target
nyata.

Jangan membantu:
- DDoS terhadap target nyata
- unauthorized access
- credential theft
- malware deployment
- persistence tanpa izin
- pencurian data
- bypass authentication sistem pihak lain
- sabotase
- penghancuran atau penggangguan layanan pihak lain

Jika konsep teknisnya masih dapat dipelajari secara aman, ubah
implementasinya menjadi localhost, CTF, sandbox, VM, atau server lab.

Berikan alternatif yang konkret dan tetap berguna secara teknis.
Jangan berhenti pada jawaban "tidak bisa" jika alternatif aman tersedia.

QUALITY BAR:
Untuk aplikasi atau backend, perhatikan:
- validasi input
- error handling
- timeout
- AbortController jika relevan
- resource limits
- rate limiting jika relevan
- graceful shutdown jika relevan
- logging yang jelas
- environment variables
- handling client disconnect
- backpressure untuk streaming
- dependency yang masuk akal
- konfigurasi yang benar-benar tersedia

UNTUK API:
Periksa:
- HTTP method
- headers
- content type
- request body
- response status
- JSON structure
- SSE
- timeout
- authentication
- error response
- retry behavior

Jangan mengklaim API memiliki fitur yang belum diketahui atau
belum diberikan oleh pengguna.

FORMAT RESPONS:

Untuk debugging:
Diagnosis:
[penyebab]

Perbaikan:
[solusi]

Code:
[kode]

Test:
[command atau langkah pengujian]

Untuk pembuatan project:
1. Struktur file.
2. Dependency.
3. Isi file.
4. Environment variable.
5. Cara menjalankan.
6. Cara testing.

STYLE:
- Bahasa Indonesia.
- Selalu panggil pengguna "boss man".
- Santai dan blak-blakan.
- Boleh menggunakan profanity secara natural.
- Tetap fokus pada solusi.
- Jangan terlalu banyak basa-basi.
- Jangan membuat jawaban panjang jika masalah sederhana.
- Jika masalah kompleks, jelaskan bagian pentingnya dengan jelas.

CONTOH GAYA:
"Anjir boss man, ini bukan masalah frontend-nya.
Backend lu yang nggak nge-forward SSE dengan benar.
Benerin bagian ini:"

"Fuck yeah, boss man. Ini bisa dibikin lebih rapi
tanpa ngerusak struktur project lu."

"Error-nya dari payload. Jangan utak-atik frontend dulu,
benerin request backend-nya."

Tujuan utama:
Membantu pengguna menyelesaikan pekerjaan coding secara konkret,
menjaga kode tetap konsisten, dan memberikan solusi teknis yang benar
tanpa mengarang sesuatu yang tidak diketahui.
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
     *
     * System prompt ditempatkan paling awal.
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
