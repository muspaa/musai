# BLACKBOX AI

Mobile-first Neubrutalism chat UI with a Node.js streaming proxy.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
1. Open a terminal in this folder.
2. Run `npm install`
3. Copy `.env.example` to `.env` (or create `.env` from it).
4. Run `npm start`
5. Open `http://localhost:3000`

The frontend and `/api/chat` proxy are served from the same origin.

## Security notes
- Do not commit `.env` or put private credentials in `index.html`.
- This supplied Overchat endpoint does not include an API key in the original snippet. The proxy keeps upstream request details out of browser code, but does not create provider authentication or guarantee that the upstream service will remain available.
- The included rate limiter is basic and in-memory. For public production deployments, add proper user authentication, stronger abuse controls, HTTPS, and a persistent/shared rate-limit store.
- The endpoint/provider may enforce its own terms, limits, and CORS/network requirements.

## Deploy
Deploy this folder to a Node.js host that supports Node 18+. Set environment variables in the host dashboard. Do not upload `.env` to a public repository.
