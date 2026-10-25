# Stage 1: Build the Rust application
FROM rust:1.88-bookworm AS builder

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

# Copy patched lsl crate to override the broken crates.io version
# COPY lsl-patched ./lsl-patched

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

# Fix a build error in the old Boost code bundled with lsl-sys 0.1.1.
# On Bookworm, PTHREAD_STACK_MIN can expand to a function call rather than
# a constant. The preprocessor cannot evaluate that call in `#if ... > 0`.
# Use #ifdef to include the stack-size check whenever the macro exists.
# The C++ code inside the block still enforces the minimum stack size,
# but can now obtain that minimum at runtime instead of preprocessing time.
# Fetch the locked dependencies first so their source is available to patch.
RUN cargo fetch --locked && \
    sed -i 's/^#if PTHREAD_STACK_MIN > 0$/#ifdef PTHREAD_STACK_MIN/' \
        /usr/local/cargo/registry/src/*/lsl-sys-0.1.1/liblsl/lslboost/boost/thread/pthread/thread_data.hpp

# Fix an ARM Linux build error in the LSL numeric sample bindings.
# The Rust wrapper passes i8 (signed-byte) buffers, but these two bindings
# use c_char, which is u8 on ARM Linux and i8 on x86 Linux. Rust rejects
# the mismatched buffer types on ARM, including Apple Silicon Docker builds.
# Change only these numeric buffer pointers to c_schar (always signed),
# matching the wrapper's i8 samples. Our EEG sender and receiver use f32
# samples, so they do not call these i8 functions. However, Rust still
# type-checks the dependency's i8 implementations even when unused, and
# their type mismatch prevents the entire lsl crate from compiling.
# Pointer size and memory layout stay the same; string bindings and our
# floating-point sample paths are unchanged. Actual i8 sample transfers
# have not been tested.
RUN sed -i '/pub fn lsl_push_sample_ctp(/,/^}/s/::std::os::raw::c_char/::std::os::raw::c_schar/; /pub fn lsl_pull_sample_c(/,/^}/s/::std::os::raw::c_char/::std::os::raw::c_schar/' \
    /usr/local/cargo/registry/src/*/lsl-sys-0.1.1/src/generated.rs

# Build dependencies only (this layer gets cached unless Cargo files change)
RUN cargo build --release --bin api-server && \
    rm -rf api-server/src

# Copy Python requirements and install (cached separately from Rust deps)
COPY api-server/python/requirements.txt ./api-server/python/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip setuptools wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r ./api-server/python/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

ENV PATH="/opt/venv/bin:$PATH"

# Now copy actual api-server source code
COPY api-server/src ./api-server/src
COPY api-server/python ./api-server/python

# Build the actual application (only this reruns on code changes)
RUN cargo build --release --bin api-server

RUN cargo install sqlx-cli --version 0.8.3 --no-default-features --features postgres


# Stage 2: Create the final minimal image
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y ca-certificates postgresql-client python3 libpython3.11 && \
    rm -rf /var/lib/apt/lists/*

# Debian registers libpython in the architecture-specific system library path.

WORKDIR /app

COPY --from=builder /app/backend/api-server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

COPY --from=builder /app/backend/target/release/api-server ./api-server

COPY --from=builder /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx

COPY --from=builder /app/backend/migrations ./migrations

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
# Embedded Python must also find packages installed in the virtual environment.
ENV PYTHONPATH="/opt/venv/lib/python3.11/site-packages"

EXPOSE 8080
EXPOSE 9000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["./api-server"]
