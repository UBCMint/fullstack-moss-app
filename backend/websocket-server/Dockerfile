# Stage 1: Build the Rust application
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app/backend

COPY . .

# Build dummy src/main.rs and run cargo check to pre-download all dependencies.
# Assuming your workspace Cargo.toml is at /app/backend/Cargo.toml,
# this dummy file should be in the root of the workspace to satisfy cargo check.
RUN mkdir -p src && echo "fn main() {}" > src/main.rs && \
    cargo check --workspace || true

RUN cargo build --release --bin websocket-server

# Stage 2: Create the final minimal image
FROM debian:bookworm-slim

WORKDIR /app

# Copy the built websocket-server binary from the builder stage
# The source path is relative to the WORKDIR in the builder stage (/app/backend)
COPY --from=builder /app/backend/target/release/websocket-server ./websocket-server

EXPOSE 8080

CMD ["./websocket-server"]
