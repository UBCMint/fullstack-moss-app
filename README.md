# Full Stack MOSS App
## Local Setup

### Frontend Setup

Follow the steps below to run the frontend locally:

1. Open your terminal and navigate to the `frontend` directory:
    ```sh
    cd frontend
    ```

2. Install project dependencies:
    ```sh
    npm i
    ```

3. Start the development server:
    ```sh
    npm run dev
    ```

4. Open a new terminal and start a server to feed mock brain signal:
    ```sh
    node server.js
    ```

5. Open the link on browser:  
    [http://localhost:3000](http://localhost:3000)
---

### Backend Setup:
These instructions were tested on Windows and not guarnateed to work on Macs
**Setup database first (using TimeScaleDB):**
1. Start TimescaleDB container:
    ```
    docker run -d --name timescaledb -p 5432:5432 -e POSTGRES_PASSWORD=my_secure_password_123 -v C:\Users\alexl\Documents\timescale_data:/var/lib/postgresql/data timescale/timescaledb:latest-pg16
    ```
2. Open a terminal and set up env variables for sqlx-cli (code blocks are terminal commands):
    ```
    $env:DATABASE_URL="postgres://postgres:my_secure_password_123@localhost:5432/postgres"
    ```
3. Navigate to Rust Workspace Root
    ```
    cd backend/backend-server
    ```
4. if /migrations/ folder does not exist or schemas are updated:
    ```
    sqlx migrate run
    ```
5. cd to shared-logic folder:
    ```
    cd shared-logic
    ```
6. Generate sqlx-data.json schema snapshot:
    ```
    cargo sqlx prepare
    ```
---

**Run api server:**
```
$env:RUST_LOG="info"
cd backend/backend-server/api-server
cargo run
```
- Exposed to port 9000
- Endpoint: http://localhost:8080/

---

**Run websocket server:**
```
$env:RUST_LOG="info"
cd backend/backend-server/websocket-server
cargo run
```
- Exposed to port 8080
- Endpoint: ws://127.0.0.1:8080

---
**Tauri App to test backend endpoints:**
- Run these commands on terminal:
    ```sh
    cd backend
    cd mint-backend-tauri-app
    npm install
    ```
- To start server (still in mint-backend-tauri-app directory):
    ```sh
    npm run tauri dev
    ```
---

## Docker Setup:
- Todo!
- Created a docker file for frontend so far, still need to dockerize backend and database.
- Eventually, will just need to run `docker-compose up --build` to run whole full stack application
