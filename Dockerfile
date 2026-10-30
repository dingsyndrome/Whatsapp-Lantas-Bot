# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATABASE_URL=file:/tmp/sigap-build.db \
    TZ=Asia/Jakarta

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ca-certificates \
        openssl \
        tini \
        fonts-liberation \
        fonts-dejavu-core \
        fonts-noto-color-emoji \
        libnss3 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libgbm1 \
        libgtk-3-0 \
        libasound2 \
        libxshmfence1 \
        libx11-xcb1 \
        libxdamage1 \
        libxrandr2 \
        libxkbcommon0 \
        python3 \
        python3-venv \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# PaddleOCR (PP-OCR via ONNX/rapidocr) = mesin OCR utama; Tesseract cadangan.
# Dipasang di venv terpisah supaya layer ini tidak ikut rebuild saat kode berubah.
RUN python3 -m venv /opt/ocr-venv \
    && /opt/ocr-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/ocr-venv/bin/pip install --no-cache-dir "rapidocr-onnxruntime>=1.3,<2"

ENV PADDLE_PYTHON=/opt/ocr-venv/bin/python

RUN npm install -g pnpm@11.28.5

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate && pnpm build

ENV NODE_ENV=production

RUN chmod +x scripts/docker-entrypoint.sh \
    && mkdir -p /data /app/storage \
    && touch /data/.keep

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["pnpm", "start"]
