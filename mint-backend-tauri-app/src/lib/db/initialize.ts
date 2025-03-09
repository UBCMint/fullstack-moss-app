export async function initializeDatabase(): Promise<string> {
    // Ensure we're running in a browser and (hopefully) in a Tauri context.
    if (typeof window === 'undefined' || !window.__TAURI__) {
      console.warn('Tauri API not available. Running in fallback mode.');
      return 'Tauri API not available';
    }
    try {
      // Construct the module path dynamically to prevent static resolution.
      const modulePath = '@tauri-apps/' + 'api/tauri';
      const { invoke } = await import(modulePath);
      const result = await invoke<string>('initialize_db');
      console.log('Database initialized');
      return result;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  