const { time } = require('console');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('New client connected');

    const interval = setInterval(() => {

        const timestamps = Array.from({ length: 20 }, (_, i) => 
            Date.now() + i * 3
        );
        const signals = Array.from({ length: 4 }, () =>
            Array.from({ length: 65 }, () => Math.floor(Math.random() * 100))
        );
        const data = {
            timestamps,
            signals,
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
