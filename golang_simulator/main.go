package main

import (
	"encoding/json" // Provides functions to encode/dencode data to/from JSON
	"fmt"           // This is used for formatting text and printing output
	"math/rand"     // Contains the methods to generate random numbers
	"net/http"      // This allows us to create an HTTP server and define routes
	"strconv"       // Converts strings to other types- useful got parsing query parameters
	"time"          // Offers time-related functions - like pausing execution for intervals
)

var running bool = false // Defines a global variable that controls the state of the simulation - initialized as false until simulation starts
var limit = 100          // Sets a default upper limit for the random numbers in the array

// Generates a random array of length 64
func generateData(limit int) []int {
	data := make([]int, 64) // Initializes an array with 64 integers - all initially 0
	// data = [0,0,0....] (length 64)
	for i := range data {
		data[i] = rand.Intn(limit + 1) // Assigns a random integer between 0 and the limit to each position in the array
	}
	return data
}

// Handles the /start endpoint to begin the simulation
// r is an instance of http.Request, which contains details about the incoming HTTP request
func startSimulation(w http.ResponseWriter, r *http.Request) {
	if running {
		fmt.Fprintln(w, "Simulation is already running!")
		return
	} else {
		// Check for a limit parameter in the request query
		// "r.URL.Query()["limit"]" Retrives any query parameter named "limit"
		// "l" is assigned as the query paramter associated with "limit"
		if l, ok := r.URL.Query()["limit"]; ok {
			// "strconv.Atoi(l[0])" Converst the paramter value from a string to an integer (first item in l)
			if val, err := strconv.Atoi(l[0]); err == nil {
				running = true // Running variable is now set to true because the simulation is running
				limit = val
				fmt.Fprintln(w, "Simulation started with limit:", limit)
			} else {
				fmt.Fprintln(w, "Invalid limit value")
				return
			}
		} else {
			running = true // Running variable is now set to true because the simulation is running
			fmt.Fprintln(w, "Simulation has started with default limit of 100")
		}

		// Start sending data as JSON arrays continuously
		go func() {
			for running {
				data := generateData(limit)
				jsonData, err := json.Marshal(data) // converts the data array to JSON format
				// Marshalling is used for serialization - converts into a byte stream (JSON) that can be sent over the network
				if err != nil {
					fmt.Println("Error marshaling data:", err) // Error handling for JSON marshaling
					continue
				}
				fmt.Println(string(jsonData))
				time.Sleep(500 * time.Millisecond) // Pauses for 500 milliseconds between data sends
			}
		}()
	}
}

// Handles the /end endpoint to end the simulation
func endSimulation(w http.ResponseWriter, r *http.Request) {
	if !running {
		fmt.Fprintln(w, "Error! Simulation has not started to end")
		return
	} else {
		running = false // Sets the running state to false
		fmt.Fprintln(w, "Simulation ended")
	}
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
