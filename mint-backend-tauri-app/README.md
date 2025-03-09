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

## Future Plans

- Process and transform data.
- Communicate with databases that receive EEG data from an EEG headset.

src/
├── app/
│   ├── layout.tsx              // Global layout, fonts, and metadata
│   ├── page.tsx                // Main home page
│   ├── globals.css             // Global styles (Tailwind directives)
│   ├── api/
│   │   └── users/
│   │       └── route.ts        // API route for users (GET request)
│   └── components/
│       ├── Form.tsx            // Main form component for user interactions
│       └── UsersList.tsx       // (Optional) Separate component to render a list of users
├── lib/
│   ├── db/
│   │   ├── initialize.ts       // Database initialization function
│   │   └── timeSeries.ts       // Time-series data functions (insert and fetch)
│   └── api/
│       └── users.ts           // Client-side API integration for user-related calls
└── types/
    └── index.ts   