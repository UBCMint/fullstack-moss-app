# Full Stack MOSS App
## Setup

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
- To start just the web socket:
    ```sh
    cd src-tauri
    cargo run --bin connection
    ```
- Currently, the rust server is too tightly coupled with Tauri app, causing unnecessary dependencies and bloat. Will work on refactoring to separate Tauri from Rust Server
---

### Docker:
- Todo!
- Created a docker file for frontend so far, still need to dockerize backend and database.
- Eventually, will just need to run `docker-compose up --build` to run whole full stack application
