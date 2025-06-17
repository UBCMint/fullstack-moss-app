# Mint Backend Tauri App

This is a simple project that demonstrates different functions to show communication between Rust, Next.js, and SQLite.

## Getting Started

### Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/UBCMint/backend-product.git
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
- If you want to only start the connection and not the entire app
```sh
cd ./src-tauri
```

```sh
cargo run --bin connection
```
- To manually stop sending data: Ctrl + c


*Note: * 
## Future Plans

- Process and transform data.
- Communicate with databases that receive EEG data from an EEG headset.