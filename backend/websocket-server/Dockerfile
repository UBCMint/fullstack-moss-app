# Stage 1: Build the Rust application
FROM rust:1.85-bullseye AS builder

# Install build dependencies for lsl-sys (C++ compiler, cmake, and pkg-config)
RUN apt-get update && \
    apt-get install -y build-essential cmake pkg-config python3 python3-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

ENV SQLX_OFFLINE=true

# Copy only Cargo files first for better layer caching
COPY Cargo.toml Cargo.lock ./
COPY shared-logic/Cargo.toml ./shared-logic/
COPY api-server/Cargo.toml ./api-server/
COPY websocket-server/Cargo.toml ./websocket-server/

# Copy .sqlx directory for offline compilation
COPY .sqlx ./.sqlx

# Copy shared-logic source (it's a library used by both servers)
COPY shared-logic/src ./shared-logic/src

# Create dummy main.rs files for workspace members to cache dependencies
# IMPORTANT: Use async main with tokio macro since the real code uses #[tokio::main]
RUN mkdir -p websocket-server/src api-server/src && \
    echo "#[tokio::main]" > websocket-server/src/main.rs && \
    echo "async fn main() {}" >> websocket-server/src/main.rs && \
    echo "fn main() {}" > api-server/src/main.rs

# Build dependencies only (this layer gets cached unless Cargo files change)
RUN cargo build --release --bin websocket-server

# Now copy actual websocket-server source code
COPY websocket-server/src ./websocket-server/src

# Force a clean rebuild of just the websocket-server binary with the real source
# Remove the dummy binary artifacts first
RUN rm -f target/release/websocket-server target/release/websocket-server.d && \
    rm -rf target/release/.fingerprint/websocket-server-* && \
    rm -rf target/release/build/websocket-server-* && \
    rm -rf target/release/deps/websocket_server-*

# Build the actual application (only this reruns on code changes)
RUN cargo build --release --bin websocket-server

# Stage 2: Create the final minimal image
FROM debian:bookworm-slim

# Install runtime dependencies for lsl library
RUN apt-get update && \
    apt-get install -y libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built websocket-server binary from the builder stage
COPY --from=builder /app/backend/target/release/websocket-server ./websocket-server

EXPOSE 8080

CMD ["./websocket-server"]
