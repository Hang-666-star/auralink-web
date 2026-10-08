# ArtLIVE 画智体 frontend-v2

Next.js 15 App Router frontend for the verified Spring Boot browser-facing API.

## Local commands

```bash
npm ci
npm run dev
```

The browser API origin is read from `NEXT_PUBLIC_API_BASE_URL`. When unset, local development uses `http://localhost:8080`. This value must identify the Spring Boot origin; provider URLs and provider credentials do not belong in this frontend.

The app stores only the backend-issued bearer token under `artlive.session.token.v1`. Passwords, roles, profile records, painting records, and AI results are not persisted in browser storage. Reload restoration validates the token through `GET /api/user/profile`; logout removes the local token because the current backend has no logout or token-revocation endpoint.
