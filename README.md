# Full Stack MOSS App
## Setup
### Local:


Frontend:
- Run these commands on terminal:
    ```sh
    cd frontend
    npm install
    npm run dev
    ```
- Website should be available at: http://localhost:3000

---

Backend:
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
- Currently, the rust server is too tightly coupled with Tauri app, causing unnecessary dependencies and bloat. Will work on refactoring to separate Tauri from Rust Server
- To start just the web socket:
    ```sh
    cd src-tauri
    cargo run --bin connection
    ```
---

### Docker:
- Todo!
- Eventually, will just need to run `docker-compose up --build` to run whole full stack application
