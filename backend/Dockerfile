FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY ml/requirements.txt ml/requirements.txt
RUN python3 -m venv /app/.venv && /app/.venv/bin/pip install --no-cache-dir -r ml/requirements.txt
COPY tsconfig.json ./
COPY src ./src
COPY ml ./ml
COPY migrations ./migrations
RUN npm run build && mkdir -p /app/ml/models && chown -R node:node /app
ENV PYTHON_EXECUTABLE=/app/.venv/bin/python NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
