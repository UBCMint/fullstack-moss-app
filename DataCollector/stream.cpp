#include <iostream>
#include <lsl_cpp.h>
#include <thread>
#include <map>
#include <vector>

// Function to print a single chunk of data
void printChunk(const std::vector<float> &chunk, std::size_t n_channels) {
    for (std::size_t i = 0; i < chunk.size(); ++i) {
        std::cout << chunk[i] << ' ';
        if (i % n_channels == n_channels - 1) std::cout << '\n'; // Print a newline after each channel set
    }
}

// Function to print a nested vector of chunks
void printChunk2(const std::vector<std::vector<float>> &chunk) {
    for (const auto &vec : chunk) { 
        printChunk(vec, vec.size());
    }
}

// Main function to resolve streams and pull data
void resolve_and_pull_stream() {
    try {
        std::cout << "Resolving all current streams..." << std::endl;

        // Discover all streams on the network
        std::vector<lsl::stream_info> results = lsl::resolve_streams();
        if (results.empty()) {
            std::cerr << "No streams found. Exiting..." << std::endl;
            return;
        }

        // Map to store found streams for display purposes
        std::map<std::string, lsl::stream_info> found_streams;

        // Display the streams that were found
        for (auto &stream : results) {
            found_streams.emplace(std::make_pair(stream.uid(), stream));
            std::cout << stream.as_xml() << "\n\n"; // Print stream details in XML format
        }

        // Create an inlet to pull data from the first resolved stream
        std::cout << "Now creating the inlet..." << std::endl;
        lsl::stream_inlet inlet(results[0]);

        // Start receiving and displaying the data
        std::cout << "Now pulling samples..." << std::endl;

        // Initialize sample vectors
        std::vector<float> sample(inlet.info().channel_count());
        std::vector<std::vector<float>> chunk_nested_vector;

        // Pull data samples a specified number of times (3 times here)
        while (true) {
            // Pull a single sample from the inlet
            double timestamp = inlet.pull_sample(sample);
            if (timestamp > 0) {
                printChunk(sample, inlet.get_channel_count()); // Print the sample data
            }

            // Sleep to give the outlet time to push new samples
            std::this_thread::sleep_for(std::chrono::milliseconds(1000));

            // Pull a chunk of samples into a nested vector
            inlet.pull_chunk(chunk_nested_vector);
            printChunk2(chunk_nested_vector); // Print the chunk data

            std::this_thread::sleep_for(std::chrono::milliseconds(1000));

            // Pull a multiplexed chunk of samples into a flat vector
            inlet.pull_chunk_multiplexed(sample);
            printChunk(sample, inlet.get_channel_count()); // Print the multiplexed chunk
        }

    } catch (const std::exception &e) {
        // Handle any exceptions that occur during execution
        std::cerr << "Got an exception: " << e.what() << std::endl;
    }
}

int main() {
    resolve_and_pull_stream();
    return 0;
}
