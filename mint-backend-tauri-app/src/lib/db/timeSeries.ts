import { TimeSeriesData } from '../../types';

export async function insertTimeSeriesData(
  timestamp: Date,
  value: number,
  metadata: string
): Promise<void> {
  if (typeof window === 'undefined' || !window.__TAURI__) {
    console.warn('Tauri API not available. Running in fallback mode.');
    return;
  }
  try {
    const modulePath = '@tauri-apps/' + 'api/tauri';
    const { invoke } = await import(modulePath);
    await invoke('insert_data', {
      timestamp: timestamp.toISOString(),
      value,
      metadata,
    });
  } catch (error) {
    console.error('Failed to insert time series data:', error);
    throw error;
  }
}


// export async function getTimeSeriesDataRange(
//   startTime: Date,
//   endTime: Date
// ): Promise<TimeSeriesData[]> {
//   try {
//     const data = await invoke<TimeSeriesData[]>('get_data_range', {
//       startTime: startTime.toISOString(),
//       endTime: endTime.toISOString(),
//     });
//     return data;
//   } catch (error) {
//     console.error('Failed to fetch time series data:', error);
//     throw error;
//   }
// }
