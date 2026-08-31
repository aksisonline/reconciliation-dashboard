FROM oven/bun:1-slim
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

# Vite inlines VITE_* vars at build time, so this has to be a build ARG,
# not just a runtime env var.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build

EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
