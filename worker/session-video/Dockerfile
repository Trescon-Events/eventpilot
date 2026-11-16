# Session video worker (Railway service #2 from this repo): Node + FFmpeg, runs worker/session-video/main.ts with tsx.
# Railway: new service from the same GitHub repo, Settings -> Build -> Dockerfile path = worker/session-video/Dockerfile.
# Variables the worker needs (set on the service, never in the repo): SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, GEMINI_API_KEY, VIDEO_R2_ACCOUNT_ID, VIDEO_R2_ACCESS_KEY_ID, VIDEO_R2_SECRET_ACCESS_KEY, VIDEO_R2_BUCKET.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# .npmrc carries legacy-peer-deps=true (the Cloudflare packages' peer ranges conflict with next); without it npm ci fails
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
ENV NODE_ENV=production
CMD ["npx", "tsx", "worker/session-video/main.ts"]
