'use client'

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { User } from './types'; // Adjust the path as necessary
import { transferDataToPostgres } from './db';

export default function Form() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [response, setResponse] = useState("");
    const [users, setUsers] = useState<User[]>([]);
    const [dbStatus, setDbStatus] = useState("");
    const [transferDbStatus, setTransferDbStatus] = useState("")

    const handleNameSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (name) {
            invoke<string>("greet", { name })
                .then(result => console.log(result))
                .catch(console.error);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            const response = await fetch('/users');  //MOCK ENDPOINT - pretend this is our backend
            if (response.ok) {
                console.log("REQ success");
                const data = await response.json();
                setResponse(data.message);
                setUsers(data); // Updated this line to handle an array directly
                console.log('Fetched users:', data);
            } else {
                throw new Error('Network Response Error');
            }
        } catch (error) {
            console.log(error);
        }
    };

    const initializeDatabase = async () => {
        try {
            const result = await invoke<string>("initialize_db");
            setDbStatus(result);
        } catch (error) {
            console.error("Failed to initialize database", error);
        }
    }

    const addUserToDatabase = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name || !email) {
            console.error("Name and email are required");
            return;
        }

        try {
            const result = await invoke<string>("add_user", { name, email });
            console.log(result);
            setResponse(result);
        } catch (error) {
            console.error("Failed to add user to database", error);
        }
    }

    const fetchUsers = async () => {
        try {
            const users = await invoke<[number, string, string][]>("get_users");
            console.log("Fetched users:", users);
        } catch (error) {
            console.error("Failed to fetch users", error);
        }
    };

    const addTimeSeriesData = async () => {
        try {
            const timestamp = new Date().toISOString();
            const value = Math.random() * 100;
            const metadata = "Sample metadata";
    
            const result = await invoke<string>("add_time_series_data", {
                timestamp,
                value,
                metadata,
            });
            console.log(result);
        } catch (error) {
            console.error("Failed to add time series data", error);
        }
    };
    
    const fetchTimeSeriesData = async () => {
        try {
            const data = await invoke<[number, string, number, string][]>("get_time_series_data");
            console.log("Fetched time series data:", data);
        } catch (error) {
            console.error("Failed to fetch time series data", error);
        }
    };

    const handleDbTransfer = async () => {
        try {
            await transferDataToPostgres();
            setTransferDbStatus("Users and time-series data successfully transferred to PostgreSQL");
        } catch (error) {
            setTransferDbStatus("Failed to transfer data");
        }
    };

    return (
        <div className="max-w-md mx-auto p-5 border border-gray-300 rounded-lg bg-gray-800">
            <button
                onClick={initializeDatabase}
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
                onClick={fetchUsers}
                className="w-full mt-4 px-5 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-700 transition duration-300 ease-in-out"
            >
                Fetch Users
            </button>

            <form onSubmit={handleNameSubmit} className="">
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
                <button
                    type="submit"
                    className="w-full px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out mb-4"
                >
                    Submit
                </button>
            </form>

            <form onSubmit={handleSubmit}>
                <button
                    type="submit"
                    className="w-full px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out"
                >
                    Get Users
                </button>
            </form>

            <button
                onClick={addTimeSeriesData}
                className="w-full mt-4 px-5 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-700 transition duration-300 ease-in-out"
            >
                Add Time Series Data
            </button>
            <button
                onClick={fetchTimeSeriesData}
                className="w-full mt-4 px-5 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out"
            >
                Fetch Time Series Data
            </button>

            <button
                onClick={handleDbTransfer}
                className="w-full mt-4 px-5 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out"
            >
                Transfer Data to PostgreSQL
            </button>
            {transferDbStatus && <p>{transferDbStatus}</p>}

            {users.length > 0 && (
                <ul className="w-full text-white mt-2 space-y-2">
                    {users.map(user => (
                        <li key={user.id} className="border-b border-gray-600 pb-2 text-gray-200">
                            {user.name} - {user.email}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
