const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('New client connected');

    const interval = setInterval(() => {
        const data = {
            time: Date.now(), // Using milliseconds since epoch for time
            signals: Array.from({ length: 5 }, () =>
                Math.floor(Math.random() * 100)
            ), // Random values for 5 brain regions
        };

        ws.send(JSON.stringify(data));
        console.log('Sent data:', data); // Log the data being sent
    }, 3); // Sends data every 10ms

    ws.on('close', () => {
        clearInterval(interval);
        console.log('Client disconnected');
    });
});

console.log('WebSocket server is running on ws://localhost:8080');
