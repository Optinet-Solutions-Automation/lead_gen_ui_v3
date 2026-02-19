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

### Submit (Lead Scraping)
1. User enters a **Keyword** and selects a **Country**, then clicks **Submit**
2. The app POSTs `{ keyword, countryValue, countryText }` to the n8n scraping webhook
3. A modal opens showing "Processing..." while the workflow runs
4. n8n finishes and POSTs the result to `/api/webhook/status`
5. The Vercel API route stores the result in Upstash Redis
6. The frontend polls `/api/status` every 2 seconds and updates the modal with success or error

### Check for Duplicates
1. User clicks **Check for Duplicates** in the action bar
2. The app fetches distinct `batch_id` values from Supabase and shows a batch selection modal
3. User selects a batch ID and clicks **Run**
4. The app fetches all records for that batch (`id`, `url`, `domain`) from Supabase
5. The array is POSTed to the duplicates n8n webhook
6. Same polling flow as Submit — modal updates with success or error

---

## Project Structure

```
├── api/
│   ├── webhook/
│   │   └── status.js       # POST — receives n8n callback, stores in Redis
│   └── status.js           # GET  — polled by frontend for workflow result
│                           # DELETE — clears stale Redis key before new submission
├── src/
│   ├── App.jsx             # Main UI: search bar, action bar, table, modals
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
| batch_id | TEXT |
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
| timestamp | TIMESTAMPTZ |

---

## Environment Variables

### Local development — `.env`

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_N8N_WEBHOOK_URL=
VITE_N8N_DUPLICATES_WEBHOOK_URL=

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

### 1. Lead Scraping — Outgoing webhook (app → n8n)
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

### 2. Check for Duplicates — Outgoing webhook (app → n8n)
**URL:** value of `VITE_N8N_DUPLICATES_WEBHOOK_URL`
**Method:** POST
**Body:** Array of records for the selected batch:
```json
[
  { "id": 1, "url": "https://example.com", "domain": "example.com" },
  { "id": 2, "url": "https://other.com",   "domain": "other.com" }
]
```

### 3. Callback webhook (n8n → app) — shared by all workflows
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

## Action Bar

| Button | Status | Description |
|---|---|---|
| Check for Affiliates | Disabled | Not yet implemented |
| Check for Duplicates | Active | Sends batch records to duplicates workflow |
| Collect S-Tags | Active | Not yet wired |
| Collect Email & Contact Info | Active | Not yet wired |

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
