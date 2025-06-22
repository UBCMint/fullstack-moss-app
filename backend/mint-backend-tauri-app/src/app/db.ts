// First, make sure you have the Tauri API package installed:
// npm install @tauri-apps/api
// or
// yarn add @tauri-apps/api
import { invoke } from '@tauri-apps/api;
interface TimeSeriesData {
  id: number;
  timestamp: string;
  value: number;
  metadata: string;
}
export async function initializeDatabase(): Promise<void> {
  try {
    await invoke('initialize_db');
    console.log('Database initialized');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function insertTimeSeriesData(
  timestamp: Date,
  value: number,
  metadata: string
): Promise<void> {
  try {
    await invoke('insert_data', {
      timestamp: timestamp.toISOString(),
      value,
      metadata
    });
  } catch (error) {
    console.error('Failed to insert data:', error);
    throw error;
  }
}

export async function getTimeSeriesDataRange(
  startTime: Date,
  endTime: Date
): Promise<TimeSeriesData[]> {
  try {
    const data = await invoke<TimeSeriesData[]>('get_data_range', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });
    return data;
  } catch (error) {
    console.error('Failed to fetch data range:', error);
    throw error;
  }
}

// Example usage in a component:
// App.tsx or similar
// import { useEffect, useState } from 'react';
// import { initializeDatabase, insertTimeSeriesData, getTimeSeriesDataRange } from './db';

// export default function TimeSeriesComponent() {
//   const [data, setData] = useState<TimeSeriesData[]>([]);

//   useEffect(() => {
//     // Initialize database when component mounts
//     initializeDatabase();
//   }, []);

//   const handleAddData = async () => {
//     try {
//       await insertTimeSeriesData(
//         new Date(),
//         Math.random() * 100,
//         'Sample metadata'
//       );
//       // Refresh data after insertion
//       await fetchLatestData();
//     } catch (error) {
//       console.error('Error adding data:', error);
//     }
//   };

//   const fetchLatestData = async () => {
//     try {
//       // Fetch last 24 hours of data
//       const endTime = new Date();
//       const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
//       const timeSeriesData = await getTimeSeriesDataRange(startTime, endTime);
//       setData(timeSeriesData);
//     } catch (error) {
//       console.error('Error fetching data:', error);
//     }
//   };

//   return (
//     <div>
//       <button onClick={handleAddData}>Add Random Data Point</button>
//       <div>
//         {data.map((point) => (
//           <div key={point.id}>
//             Timestamp: {new Date(point.timestamp).toLocaleString()} - 
//             Value: {point.value}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
