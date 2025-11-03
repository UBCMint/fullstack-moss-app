https://www.figma.com/board/4UUXdzNg0rMLQoMUcc5R3e/ubcmint_backend?node-id=0-1&t=NO81CLSnXEB2WoHj-1

For more info on set up: https://docs.tigerdata.com/self-hosted/latest/install/installation-docker/

# Prerequisites
- docker, https://www.docker.com/get-started/

# Setup Docker container 
- Pull the timescaleDB image
```
docker pull timescale/timescaledb:latest-pg17
```

- Run the container, replace `C:\Users\local_folder` with the folder location on your computer
```
docker run -d --name timescaledb -p 5432:5432 -e POSTGRES_PASSWORD=my_secure_password_123 -v C:\Users\local_folder:/var/lib/postgresql/data timescale/timescaledb:latest-pg17
```

# Setting up Database

- Access the database 
```sql
docker exec -it timescaledb psql -U postgres
```

*Note: to copy and paste, Ctr + Shift+ C*

- Set up Mint User
```sql
CREATE USER team_user WITH PASSWORD 'ubcmintpw';
\du --to check user is created
CREATE DATABASE ubcmint;
\l --to check the database was created
GRANT ALL PRIVILEGES ON DATABASE ubcmint TO team_user; 

SET ROLE team_user;
SELECT CURRENT_USER; --to check the current role is team_user
```

- Go into the created ubcmint database
```sql
\c ubcmint
```

- Creating the tables

 ```
 -- Create Users table
 CREATE TABLE users (
   id SERIAL PRIMARY KEY,
   username VARCHAR(50) NOT NULL UNIQUE,
   email VARCHAR(100) NOT NULL UNIQUE
 );
 
 -- Create User_Settings table
 CREATE TABLE user_settings (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   filter_config JSONB,
   interface_prefs JSONB
 );
 
 -- Create Sessions table
 CREATE TABLE sessions (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   ended_at TIMESTAMPTZ
 );
 
 -- Create Headsets table
 CREATE TABLE headsets (
   id SERIAL PRIMARY KEY,
   model VARCHAR(100) NOT NULL,
   manufacturer VARCHAR(100) NOT NULL,
   serial_number TEXT UNIQUE,
   calibration_data JSONB
 );
 
 -- Create ML_Models table
 CREATE TABLE ml_models (
   id SERIAL PRIMARY KEY,
   name VARCHAR(100) NOT NULL,
   version VARCHAR(50),
   description TEXT,
   config JSONB
 );
 
 -- Create User_ML_Selections table
 CREATE TABLE user_ml_selections (
   id SERIAL PRIMARY KEY,
   user_id INTEGER NOT NULL REFERENCES users(id),
   ml_model_id INTEGER NOT NULL REFERENCES ml_models(id),
   parameters JSONB
 );
 
 -- Create EEG_Data table (to store time-series EEG data)
 CREATE TABLE eeg_data (
   time TIMESTAMPTZ NOT NULL,
   session_id INTEGER NOT NULL REFERENCES sessions(id),
   headset_id INTEGER NOT NULL REFERENCES headsets(id),
   channel1 DOUBLE PRECISION,
   channel2 DOUBLE PRECISION,
   channel3 DOUBLE PRECISION,
   channel4 DOUBLE PRECISION,
   PRIMARY KEY (time, session_id)
 );
 
 -- Convert the eeg_data table into a hypertable
 SELECT create_hypertable('eeg_data', 'time');
 ```
 
- to escape
```sql
exit
```

## New tables: sessions and frontend_state

-- In order to store front-end state, we've added two new tables.

- `sessions` — This stores the sessions themselves, and just has fields id and name.
- `frontend_state` — Each session has a corresponding 'frontend_state' entry, containing 
the required frontend data as a JSON, an id referencing its number in the sessions table,
and a timestamp to keep track of when it was last updated.

Additionally, note that cascade is in place, so deleting a session will cause it to cascade
to the corresponding frontend_state entry.

To add them, run the migration '20251101120000_add_sessions_and_frontend_state.sql'.

```