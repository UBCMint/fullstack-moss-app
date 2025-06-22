# Mint Backend Tauri App

This is a simple project that demonstrates different functions to show communication between Rust, Next.js, and SQLite.

## Getting Started

### Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/UBCMint/fullstack-moss-app.git
    cd backend
    cd mint-backend-tauri-app
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

### Running the Application

To start the application, run:
```sh
npm run tauri dev
```

### Starting the Connection
- By starting the application the connection also starts

#### Only Starting the connection
- If you want to only start the connection and not the entire app, you have to `cd` into the `src-tauri` folder.
```sh
cd ./src-tauri
```
- then run it by
```sh
cargo run --bin connection
```
- To manually stop sending data: Ctrl + c

## Future Plans

- Process and transform data.
- Communicate with databases that receive EEG data from an EEG headset.