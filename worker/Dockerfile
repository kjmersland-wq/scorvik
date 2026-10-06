FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/worker ./src/worker
COPY src/lib/render ./src/lib/render
COPY src/lib/audio ./src/lib/audio
COPY src/lib/music ./src/lib/music
COPY src/lib/ingestion ./src/lib/ingestion
COPY src/types ./src/types
COPY public/music ./public/music

RUN mkdir -p .scorvik-renders && chown node:node .scorvik-renders
USER node

ENV NODE_ENV=production \
  FFMPEG_PATH=ffmpeg \
  FFPROBE_PATH=ffprobe \
  SCORVIK_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/worker/server.ts"]