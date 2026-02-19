# Google Lead Gen

A Vite + React web app for generating and viewing Google search leads. Submits keyword and country to an n8n scraping workflow and displays the results in a table.

**Live:** https://lead-gen-ui-v3.vercel.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7 |
| Deployment | Vercel |
| Database | Supabase (PostgreSQL) |
| Status broker | Upstash Redis |
| Automation | n8n Cloud |

---

## How It Works

1. User enters a **Keyword** and selects a **Country**, then clicks **Submit**
2. The app POSTs `{ keyword, countryValue, countryText }` to the n8n webhook
3. A modal opens showing "Processing..." while the workflow runs
4. n8n finishes and POSTs the result to `/api/webhook/status`
5. The Vercel API route stores the result in Upstash Redis
6. The frontend polls `/api/status` every 2 seconds and updates the modal with success or error

---

## Project Structure

```
├── api/
│   ├── webhook/
│   │   └── status.js       # POST — receives n8n callback, stores in Redis
│   └── status.js           # GET  — polled by frontend for workflow result
├── src/
│   ├── App.jsx             # Main UI: search bar, table, modal
│   ├── App.css             # Styles
│   ├── supabase.js         # Supabase client
│   └── index.css           # Global styles
├── server.js               # Local Express server (dev only)
└── .env                    # Environment variables (see below)
```

---

## Database Tables

**`s_tags_table`**
| Column | Type |
|---|---|
| s_tag_id | SERIAL PRIMARY KEY |
| s_tag | TEXT |
| brand | TEXT |

**`google_lead_gen_table`**
| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| keyword | TEXT |
| country | TEXT |
| url | TEXT |
| domain | TEXT |
| position_on_page | INTEGER |
| page_number | INTEGER |
| overall_position | INTEGER |
| result_type | TEXT |
| affiliate_name | TEXT |
| lead_type | TEXT |
| remarks | TEXT |
| s_tag_id | INTEGER → s_tags_table |

---

## Environment Variables

### Local development — `.env`

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_N8N_WEBHOOK_URL=

VITE_COUNTRIES=[{"id":"...","name":"..."}]

# Server-side only (no VITE_ prefix)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### Vercel dashboard — Project Settings → Environment Variables

| Key | Notes |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |

> `VITE_*` variables are baked into the static build at deploy time. Set them in Vercel's environment variables as well if they differ from local.

---

## n8n Integration

### Outgoing webhook (app → n8n)
**URL:** value of `VITE_N8N_WEBHOOK_URL`
**Method:** POST
**Body:**
```json
{
  "keyword": "user input",
  "countryValue": "697b1b609a01a2ed8d8792ca",
  "countryText": "Canada"
}
```

### Callback webhook (n8n → app)
**URL:** `https://lead-gen-ui-v3.vercel.app/api/webhook/status`
**Method:** POST

**On success:**
```json
{
  "status": "Success",
  "message": "Successful Scraping"
}
```

**On error:**
```json
{
  "status": "error",
  "message": "{{ $json.error.message }}",
  "failed_node": "{{ $json.error.node.name }}",
  "timestamp": "{{ $json.error.timestamp }}"
}
```

---

## Running Locally

```bash
npm install

# Run frontend only
npm run dev

# Run frontend + local webhook listener together
npm run start
```

> Note: The Vercel API routes (`/api/*`) do not run under `npm run dev`. For full local testing of the webhook flow use `vercel dev` (requires Vercel CLI).
