package main

/*
#cgo LDFLAGS: -L. -lstream -llsl -lpthread
#include <stdlib.h>

// Declare the C++ function
extern void resolve_and_pull_stream();
*/
import "C"
import "fmt"

func main() {
	fmt.Println("Starting the Go program...")
	// Call the C++ function
	C.resolve_and_pull_stream()
	fmt.Println("Finished.")
}
