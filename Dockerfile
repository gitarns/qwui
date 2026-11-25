FROM node:20.19.5 AS npm-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/vite.config.js frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/scripts ./scripts
RUN npm run build

FROM rust:1.90.0 AS rust-builder
WORKDIR /app
COPY rust-backend/Cargo.toml rust-backend/Cargo.lock ./
COPY rust-backend/src ./src
RUN apt-get update && apt-get install -y \
    libssl-dev \
    pkg-config
RUN cargo build --release

FROM debian:trixie-slim AS prod
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=npm-builder /app/dist/ /app/dist/
COPY --from=rust-builder /app/target/release/qwui /app/qwui
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["/app/qwui"]
