# SmartExcel processing worker

Deterministic spreadsheet/document processing service. **Not** deployable to
Cloudflare Workers — it needs Python data libraries (pandas, openpyxl, pdfplumber)
that require a real container. Deploy to **Google Cloud Run** (pairs naturally with
Gemini) or **Cloudflare Containers**.

## Why a separate service

The web app (TanStack Start on Cloudflare Workers) orchestrates and reasons; this
worker executes. See the project root `CLAUDE.md` for the full architecture.

## Run locally

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in as needed
uvicorn app.main:app --reload --port 8080
# health check:
curl localhost:8080/health
```

## Job contract

`POST /process` (Bearer `WORKER_SHARED_SECRET`) — returns **202** immediately and
processes in the background:

```json
{
  "job_id": "uuid",
  "plan_id": "uuid",
  "stage": "sample",
  "input_object_key": "jobs/<id>/input.xlsx",
  "options": {}
}
```

When done it uploads output(s) + a small `preview.json` to R2 and POSTs the result
to `${APP_CALLBACK_URL}/api/worker-callback` (same Bearer):

```json
{
  "job_id": "uuid",
  "stage": "sample",
  "status": "succeeded",
  "output_object_key": "jobs/<id>/sample/output.xlsx",
  "preview_object_key": "jobs/<id>/sample/preview.json",
  "summary": "…",
  "rows_processed": 1
}
```

`POST /inspect` (Bearer) is a synchronous helper the clarification engine calls to
read `{ sheets, headers, sample_rows }` from an uploaded file.

## Deploy (Cloud Run example)

```bash
gcloud run deploy smartexcel-worker \
  --source . \
  --region asia-south1 \
  --set-env-vars WORKER_SHARED_SECRET=...,R2_BUCKET=smartexcel-files
```
