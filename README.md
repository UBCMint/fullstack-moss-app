# Full Stack MOSS App

## Docker Setup:
- Make sure you have installed Docker
- Run command
    ```sh
    docker compose up --build
    ```
- Navigate to http://localhost:3000
- It till take 5-10 minutes to run at first, but will be significantly faster afterwards
    - This is because it will cache some of the layers so it won't have to build again.
- URLS:
    - Frontend:  http://localhost:3000
    - Websocket: ws://0.0.0.0:8080
    - API: 0.0.0.0:9000

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
3. Set up sqlx-cli
    ```
    # Install
    cargo install sqlx-cli  

    # Check Installed 
    sqlx --version
    ```
4. Navigate to Rust Workspace Root
    ```
    cd backend/backend-server
    ```
5. if /migrations/ folder does not exist or schemas are updated:
    ```
    sqlx migrate run
    ```

    **if migrations already exist and need to reset migrations**
        - run the database and connect to it
        ```
        docker exec -it timescaledb psql -U postgres
        ```
        - remove the old one from database
        ```
        DELETE FROM _sqlx_migrations WHERE version = 20250630230435;
        ```
        - go back and re-run
        ```
        sqlx migrate run
        ```

6. Generate sqlx-data.json schema snapshot:
    ```
    cargo sqlx prepare --workspace
    ```

**clean up database after testing(optional):**
1. connect to the database
```
 docker exec -it timescaledb psql -U postgres
```
2. clear all data in the table
```sql
 TRUNCATE TABLE eeg_data;
```
---

**Run api server:**
```
$env:RUST_LOG="info"
cd backend/backend-server/api-server
cargo run
```
- Exposed to port 9000
- Endpoint: http://localhost:9000/

---

**Run websocket server:**
- start the docker database 
```
$env:DATABASE_URL="postgres://postgres:my_secure_password_123@localhost:5432/postgres"
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
