# Stage 1: Build the Rust application
FROM rust:1.88-bullseye AS builder

RUN apt-get update && \
    apt-get install -y \
        python3-dev \
        python3-pip \
        python3-venv \
        pkg-config \
        build-essential \
        cmake && \
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

# Copy migrations directory for the final image
COPY migrations ./migrations

# Copy docker-entrypoint.sh for the final image
COPY api-server/docker-entrypoint.sh ./api-server/docker-entrypoint.sh

# Create dummy main.rs files for workspace members to cache dependencies
# IMPORTANT: Use async main with tokio macro since both servers use #[tokio::main]
RUN mkdir -p api-server/src websocket-server/src && \
    echo "#[tokio::main]" > api-server/src/main.rs && \
    echo "async fn main() {}" >> api-server/src/main.rs && \
    echo "#[tokio::main]" > websocket-server/src/main.rs && \
    echo "async fn main() {}" >> websocket-server/src/main.rs

# Build dependencies only (this layer gets cached unless Cargo files change)
RUN cargo build --release --bin api-server && \
    rm -rf api-server/src

# Copy Python requirements and install (cached separately from Rust deps)
COPY api-server/python/requirements.txt ./api-server/python/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r ./api-server/python/requirements.txt

ENV PATH="/opt/venv/bin:$PATH"

# Now copy actual api-server source code
COPY api-server/src ./api-server/src
COPY api-server/python ./api-server/python

# Build the actual application (only this reruns on code changes)
RUN cargo build --release --bin api-server

RUN cargo install sqlx-cli --no-default-features --features postgres


# Stage 2: Create the final minimal image
FROM debian:bullseye-slim

RUN apt-get update && \
    apt-get install -y ca-certificates postgresql-client python3 libpython3.9 && \
    rm -rf /var/lib/apt/lists/*

RUN ldconfig
ENV LD_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu/:/usr/local/lib:/usr/lib/python3.9/:/opt/venv/lib:$LD_LIBRARY_PATH"

WORKDIR /app

COPY --from=builder /app/backend/api-server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

COPY --from=builder /app/backend/target/release/api-server ./api-server

COPY --from=builder /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx

COPY --from=builder /app/backend/migrations ./migrations

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080
EXPOSE 9000

ENTRYPOINT ["./api-server/docker-entrypoint.sh"]
CMD ["./api-server"]
