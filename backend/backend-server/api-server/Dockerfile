# Stage 1: Build the Rust application
FROM rust:1.85-bullseye AS builder

RUN apt-get update && \
    apt-get install -y libpython3.9-dev python3-pip python3-venv pkg-config build-essential cmake && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend-server

ENV SQLX_OFFLINE=true

COPY . .

# Build dummy src/main.rs to pre-download dependencies.
RUN mkdir -p src && echo "fn main() {}" > src/main.rs && \
    cargo check --workspace || true

COPY api-server/python/requirements.txt ./api-server/python/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r ./api-server/python/requirements.txt

ENV PATH="/opt/venv/bin:$PATH"

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

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

COPY --from=builder /app/backend-server/target/release/api-server ./api-server

COPY --from=builder /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx

COPY --from=builder /app/backend-server/migrations ./backend-server/migrations

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080
EXPOSE 9000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["./api-server"]
