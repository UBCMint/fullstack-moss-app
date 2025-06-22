# Headset Simulation Endpoints 

To assist in development, we'll need to develop backend endpoints to simulate brain waves from a headset. Since in reality we are getting real-time data from the headsets, the simulator should be implemented in Rust/Golang due to their speed and ability to deal with real-time environments. With each of these, we'll need them to send out vectors/arrays of length 64 as fast as possible with upper limits we can set when the endpoints are called. We'll also need end commands and start commands. These APIs need to be able to handle multiple clients and not have any CORS issues (a globally-accessible, static vector)


## Example workflow: 

    start command

    endpoint starts sending out vectors of data: Eg. [1,1,1,1,1,1,1] 

    end command and endpoint stops sending data


## Tasks (These endpoints should have the same behaviour):

    1. An endpoint in Rust that fulfills the above requirements

    2. An endpoint in Golang that fulfills the above requirements
# TO PULL THE DATA FROM EEG HEADSETS - 
**Clone this repository**

**Clone the `liblsl` repository within the base branch:**
   ```sh
   git clone https://github.com/sccn/liblsl.git
   cd liblsl
   ```

3. **Install required dependencies:**
   ```sh
   sudo apt-get install cmake build-essential
   ```

4. **Build `liblsl`:**
   ```sh
   mkdir build
   cd build
   cmake ..
   make
   ```

5. **Compile the `stream.cpp` file:**
   ```sh
   g++ -shared -o libstream.so -fPIC stream.cpp -llsl -lpthread
   ```

6. **Run the C++ file:**
   ```sh
   ./stream
   ```

## Notes
- Make sure the compiled `libstream.so` file is in the same directory as your Go file.
- If you encounter permission issues, try running commands with `sudo`.
- Ensure your Go environment is set up correctly before running `main.go`.

## Troubleshooting
If you experience issues, consider:
- Verifying that `liblsl` is correctly built (`ls build` should list compiled files).
- Checking that the correct dependencies are installed.
- Ensuring `LD_LIBRARY_PATH` includes the necessary shared libraries.
