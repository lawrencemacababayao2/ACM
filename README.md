# AgriConnect Medina (ACM)

Capstone system for the Municipal Agriculture Office (MAO) of Medina, Misamis Oriental.

- **`server/`** – Express + MariaDB REST API on port **3001** (`/api/*`)
- **`web/`** – React (Vite) admin portal for MAO staff (`staff` / `admin`) on port **5173**
- **`landing-website/`** – Public landing website (Vite) on port **5174**: hero carousel, programs/services,
  about, stats, "why choose", and FAQ sections are all managed from the web admin (Landing Carousel,
  Landing Content, FAQ Knowledge Base), plus the floating "ACM Assistant" AI chatbot with a header-nav Ask AI page
- **`mobile/`** – Expo app for beneficiaries (Android/iOS), hosted on `10.0.2.2:3001` in emulators (see `mobile/src/theme.js`; override with `EXPO_PUBLIC_API_URL`)
- **`scripts/`** – start/stop helpers for the project-local database

The web portal is for MAO personnel; beneficiaries use the mobile app; the public landing site (`landing-website/`) is the town residents' front door and is managed from the web portal (Landing Carousel page).

## Prerequisites

- Node.js 20+
- XAMPP with MySQL/MariaDB (this project uses `C:\xampp\mysql\bin`)

## 1. Database

The XAMPP default `mysql` instance is unreliable on this machine, so the project uses its
own initialized data directory on port **3307** (`C:\xampp\acm-mysql-data`, root / no password).

Start it (keep the window open), then import the schema once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-db.ps1
# fresh import (first time or to reset):
cmd /c "C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root < server\schema.sql"
C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root -e "USE acm; SHOW TABLES;"
```

Stop it with `scripts\stop-db.ps1`.

## 2. API server

```powershell
cd server
copy .env.example .env   # defaults point at 127.0.0.1:3307/acm; only JWT_SECRET is essential
npm install
npm start                # http://localhost:3001  (health check: /api/health)
```

Optional integrations (add keys to `server/.env` when available):

- **SMS** – provider-agnostic. Blank `SMS_API_KEY` = **LOG mode** (records in `notifications`,
  prints to console). Set `SMS_API_KEY` + `SMS_GATEWAY_URL` (Semaphore-compatible POST) to go live.
- **Chatbot** – no `LLM_API_KEY` = built-in FAQ keyword matcher ("ACM Assistant" persona).
  Set `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` (any OpenAI-compatible `/chat/completions`).

## 3. Web admin portal

```powershell
cd web
npm install
npm run dev              # http://localhost:5173
npm run build            # production build -> web/dist
```

Demo logins (from schema seed):

| Role        | Email                | Password |
|-------------|----------------------|----------|
| Admin       | admin@mao.gov.ph     | admin123 |
| Staff       | staff@mao.gov.ph     | staff123 |
| Beneficiary | ana@example.com      | ana123   |

## 4. Public landing website

```powershell
cd landing-website
npm install
npm run dev              # http://localhost:5174
npm run build            # production build -> landing-website/dist
```

Content is managed from the web admin (Landing Carousel page) and fetched from the same API.
Set `VITE_API_URL` in `landing-website/.env` if the API is not on `http://localhost:3001/api`.

## 5. Mobile app (beneficiary)

```powershell
cd mobile
npm install
npx expo start           # scan QR with Expo Go, or press 'a' for Android emulator
npx expo export --platform android   # verify the JS bundle builds
```

Beneficiary self-registers in the app; MAO verifies them in the web portal (Beneficiaries →
Verify). Only verified accounts can submit requests.

## Notes

- Emails are normalized to lowercase on the server (`users.email` is unique).
- The API binds to `0.0.0.0`; mobile devices on the same LAN use your PC's LAN IP via
  `EXPO_PUBLIC_API_URL` (Android emulator already maps `localhost` → `10.0.2.2`).
- CORS is open (`*`) for development.