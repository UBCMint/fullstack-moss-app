import os
import time
import mne
import redis
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# Environment variables
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'brainwaves')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'myuser')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'mypassword')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))

# Retry function for PostgreSQL connection
def connect_to_postgres(retries=5, delay=5):
    conn = None
    for attempt in range(retries):
        try:
            print(f"Attempting to connect to PostgreSQL... (Attempt {attempt + 1})")
            conn = psycopg2.connect(
                dbname=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                host=POSTGRES_HOST
            )
            print("Connected to PostgreSQL!")
            return conn
        except psycopg2.OperationalError as e:
            print(f"PostgreSQL connection failed: {e}")
            if attempt < retries - 1:
                print(f"Retrying in {delay} seconds...")
                time.sleep(delay)
            else:
                print("Failed to connect to PostgreSQL after several attempts.")
                raise e
    return conn

def main():
    # Connect to Redis
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)

    # Connect to PostgreSQL with retries
    conn = connect_to_postgres(retries=5, delay=5)
    cursor = conn.cursor()

    # Download and read the dataset using MNE
    data_path = mne.datasets.sample.data_path()
    raw = mne.io.read_raw_fif(data_path / 'MEG' / 'sample' / 'sample_audvis_raw.fif', preload=True)
    data, times = raw[:]

    # Save data to Redis
    print("Saving data to Redis...")
    r.execute_command('TS.CREATE', 'eeg_series', 'RETENTION', 600000)  # Retain data for 10 minutes
    for idx, value in enumerate(data[0]):
        timestamp = int(times[idx] * 1000)  # Convert to milliseconds
        r.execute_command('TS.ADD', 'eeg_series', timestamp, float(value))
    print("Data saved to Redis.")

    # Fetch data from Redis
    print("Fetching data from Redis...")
    data_points = r.execute_command('TS.RANGE', 'eeg_series', '-', '+')
    print(f"Fetched {len(data_points)} data points from Redis.")

    # Prepare data for PostgreSQL
    records = [(datetime.fromtimestamp(dp[0]/1000.0), dp[1]) for dp in data_points]

    # Create table in PostgreSQL if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS eeg_data (
        time TIMESTAMPTZ NOT NULL,
        value DOUBLE PRECISION NOT NULL
    );
    """)
    conn.commit()

    # Enable TimescaleDB extension and hypertable
    cursor.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
    cursor.execute("""
    SELECT create_hypertable('eeg_data', 'time', if_not_exists => TRUE);
    """)
    conn.commit()

    # Insert data into PostgreSQL
    print("Inserting data into PostgreSQL...")
    insert_query = "INSERT INTO eeg_data (time, value) VALUES %s"
    execute_values(cursor, insert_query, records)
    conn.commit()
    print("Data inserted into PostgreSQL.")

    # Optionally, delete data from Redis
    r.delete('eeg_series')
    print("Data deleted from Redis.")

    # Close connections
    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
