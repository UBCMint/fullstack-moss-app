// "use client";
// import { useState, useRef } from "react";

// export default function Home() {
//   const [data, setData] = useState([]);
//   const ws = useRef<WebSocket | null>(null);

//   const startWebSocket = () => {
//     if (ws.current) return; // Prevent multiple connections
//     ws.current = new WebSocket("ws://127.0.0.1:9000");

//     ws.current.onopen = () => {
//       console.log("WebSocket connection established.");
//       // Request EEG data stream
//       ws.current?.send("get_eeg");
//     };

//     ws.current.onmessage = (event) => {
//       try {
//         const parsed = JSON.parse(event.data);
//         setData(parsed);
//       } catch (error) {
//         console.error("Error parsing data:", error);
//       }
//     };

//     ws.current.onerror = (error) => {
//       console.error("WebSocket error:", error);
//     };

//     ws.current.onclose = () => {
//       console.log("WebSocket connection closed.");
//       ws.current = null;
//     };
//   };

//   const stopWebSocket = () => {
//     if (ws.current) {
//       ws.current.close();
//       ws.current = null;
//     }
//   };

//   // Helper function to convert a UTC timestamp to local time string
//   const formatLocalTime = (timestamp: number) => {
//     return new Date(timestamp * 1000).toLocaleString();
//   };

//   return (
//     <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-black">
//       <div className="flex flex-col items-center space-y-6 bg-gray-800 p-8 rounded-lg shadow-lg">
//         <h1 className="text-2xl font-bold text-white">
//           Processed EEG Data Stream
//         </h1>
//         <div className="flex space-x-4">
//           <button
//             onClick={startWebSocket}
//             className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition duration-300"
//           >
//             Start Getting EEG Data
//           </button>
//           <button
//             onClick={stopWebSocket}
//             className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded transition duration-300"
//           >
//             Stop Getting EEG Data
//           </button>
//         </div>

//         <div className="w-full max-w-2xl bg-gray-700 p-4 rounded text-white">
//           <h2 className="text-lg font-semibold mb-2">Received Data:</h2>
//           {data.map((entry: any, idx: number) => (
//             <div key={idx} className="mb-2">
//               <p>Channel: {entry.channel}</p>
//               <p>Value: {entry.value.toFixed(2)}</p>
//               <p>Local Time: {formatLocalTime(entry.timestamp)}</p>
//               <hr className="my-2 border-gray-600" />
//             </div>
//           ))}
//         </div>
//       </div>
//     </main>
//   );
// }
