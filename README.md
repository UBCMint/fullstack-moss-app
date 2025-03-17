https://www.figma.com/board/4UUXdzNg0rMLQoMUcc5R3e/ubcmint_backend?node-id=0-1&t=NO81CLSnXEB2WoHj-1

I've set up the TimeScaleDB database with tables:
 
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
   channel5 DOUBLE PRECISION,
   channel6 DOUBLE PRECISION,
   channel7 DOUBLE PRECISION,
   channel8 DOUBLE PRECISION,
   PRIMARY KEY (time, session_id)
 );
 
 -- Convert the eeg_data table into a hypertable
 SELECT create_hypertable('eeg_data', 'time');
 ```
