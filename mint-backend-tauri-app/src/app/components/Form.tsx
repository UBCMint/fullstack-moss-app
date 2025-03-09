'use client';

import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { User } from '../../types';
import { initializeDatabase } from '../../lib/db/initialize';
import { insertTimeSeriesData, getTimeSeriesDataRange } from '../../lib/db/timeSeries';
import { fetchUsers } from '../../lib/api/users';

export default function Form() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [dbStatus, setDbStatus] = useState('');

  const handleNameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name) {
      try {
        const result = await invoke<string>('greet', { name });
        console.log(result);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleFetchUsersAPI = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const data = await fetchUsers();
      setUsers(data);
      console.log('Fetched users:', data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDatabaseInit = async () => {
    try {
      const result = await initializeDatabase();
      setDbStatus(result);
    } catch (error) {
      console.error('Failed to initialize database', error);
    }
  };

  const addUserToDatabase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name || !email) {
      console.error('Name and email are required');
      return;
    }
    try {
      const result = await invoke<string>('add_user', { name, email });
      console.log(result);
      setResponseMessage(result);
    } catch (error) {
      console.error('Failed to add user to database', error);
    }
  };

  const handleAddTimeSeriesData = async () => {
    try {
      const timestamp = new Date();
      const value = Math.random() * 100;
      const metadata = 'Sample metadata';
      await insertTimeSeriesData(timestamp, value, metadata);
      console.log('Time series data added');
    } catch (error) {
      console.error('Failed to add time series data', error);
    }
  };

  const handleFetchTimeSeriesData = async () => {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
      const data = await getTimeSeriesDataRange(startTime, endTime);
      console.log('Fetched time series data:', data);
    } catch (error) {
      console.error('Failed to fetch time series data', error);
    }
  };

  const runPythonScript = async () => {
    try {
      const result = await invoke<string>('run_python_script');
      console.log(result);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="max-w-md mx-auto p-5 border border-gray-300 rounded-lg bg-gray-800">
      <button
        onClick={handleDatabaseInit}
        className="w-full px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out mb-4"
      >
        Initialize Database
      </button>
      {dbStatus && <p className="text-white mb-4">{dbStatus}</p>}
      <form onSubmit={addUserToDatabase}>
        <div className="mb-2">
          <label htmlFor="name" className="block mb-2 font-bold">
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full p-2 border border-gray-300 rounded-md bg-gray-700"
          />
        </div>
        <div className="mb-2">
          <label htmlFor="email" className="block mb-2 font-bold">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full p-2 border border-gray-300 rounded-md bg-gray-700"
          />
        </div>
        <button
          type="submit"
          className="w-full px-5 py-2 bg-green-500 text-white rounded-md hover:bg-green-700 transition duration-300 ease-in-out"
        >
          Add User to Database
        </button>
      </form>
      <button
        onClick={handleFetchUsersAPI}
        className="w-full mt-4 px-5 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-700 transition duration-300 ease-in-out"
      >
        Get Users (Fetch API)
      </button>
      <form onSubmit={handleNameSubmit}>
        <div className="mb-2">
          <label htmlFor="name" className="block mb-2 font-bold">
            Greet (Name)
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full p-2 border border-gray-300 rounded-md bg-gray-700"
          />
        </div>
        <button
          type="submit"
          className="w-full px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out mb-4"
        >
          Greet
        </button>
      </form>
      <button
        onClick={handleAddTimeSeriesData}
        className="w-full mt-4 px-5 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-700 transition duration-300 ease-in-out"
      >
        Add Time Series Data
      </button>
      <button
        onClick={handleFetchTimeSeriesData}
        className="w-full mt-4 px-5 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out"
      >
        Fetch Time Series Data
      </button>
      <button
        onClick={runPythonScript}
        className="w-full mt-4 px-5 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out"
      >
        Run Python Script
      </button>
      {users.length > 0 && (
        <ul className="w-full text-white mt-2 space-y-2">
          {users.map((user) => (
            <li key={user.id} className="border-b border-gray-600 pb-2">
              {user.name} - {user.email}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
