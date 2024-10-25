package main

import (
	"fmt"      // This is used for formatting text and printing output
	"net/http" // This allows us to create an HTTP server and define routes
)

// Handles the /start endpoint to begin the simulation
func startSimulation(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Simulation started")
}

// Handles the /end endpoint to end the simulation
func endSimulation(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Simulation ended")
}

func main() {
	// Sets up the /start route - it maps the /start URL path to the startSimulation function
	http.HandleFunc("/start", startSimulation)

	// Sets up the /end route - it maps the /end URL path to the endSimulation function
	http.HandleFunc("/end", endSimulation)

	// Indicates that the HTTP server has started and is listening for requests on port 8080
	fmt.Println("Server started on :8080")

	// ListenAndServe starts the HTTP server
	// ":8080" indicates that it will listen on all interfaces on port 8080
	// nil means it will use the default HTTP handler
	// err will contain error information if there is an issue starting the server
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Println("Error starting server:", err)
	}
}
