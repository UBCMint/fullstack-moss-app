'use client'

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { User } from './types';

export default function Form() {
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [response, setResponse] = useState("");
    const [users, setUsers] = useState<User[]>([]);

    const addUserToDatabase = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!username || !email) {
            console.error("Username and email are required");
            return;
        }

        try {
            const result: User = await invoke("add_user_command", { username, email });
            console.log("User added:", result);
            setResponse(`User ${result.username} (ID: ${result.id}) added successfully!`);
            setUsername("");
            setEmail("");
            fetchUsers();
        } catch (error) {
            console.error("Failed to add user to database", error);
            setResponse(`Error adding user: ${error}`);
        }
    }

    const fetchUsers = async () => {
        try {
            const fetchedUsers: User[] = await invoke("get_users_command");
            console.log("Fetched users:", fetchedUsers);
            setUsers(fetchedUsers);
            setResponse(`Fetched ${fetchedUsers.length} users.`);
        } catch (error) {
            console.error("Failed to fetch users", error);
            setResponse(`Error fetching users: ${error}`);
        }
    };

    const runPythonScript = async () => {
        try {
        const result = await invoke<string>("run_python_script")
        setResponse(`${result}`);
        } catch (error) {
            console.error("Failed to run Python script", error);
            setResponse(`Error running Python script: ${error}`);
        }
    };

    const addTimeSeriesData = async () => {
        try {
            // const timestamp = new Date().toISOString();
            const timestamp = new Date().getTime(); // returns a number (milliseconds)

            const value = Math.random() * 100;
            const metadata = "Sample metadata";
    
            const result = await invoke<string>("add_testtime_series_data_command", {
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
            const data = await invoke<[number, string, number, string][]>("get_testtime_series_data_command");
            console.log("Fetched time series data:", data);
        } catch (error) {
            console.error("Failed to fetch time series data", error);
        }
    };

    return (
        <div className="max-w-md mx-auto p-5 border border-gray-300 rounded-lg bg-gray-800">
            <div className="mb-2">
                {response}
            </div>
            <form onSubmit={addUserToDatabase}>
                <div className="mb-2">
                    <label htmlFor="name" className="block mb-2 font-bold">
                        Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
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

            {users.length > 0 && (
                <ul className="w-full text-white mt-2 space-y-2">
                    {users.map(user => (
                        <li key={user.id} className="border-b border-gray-600 pb-2 text-gray-200">
                            {user.username} - {user.email}
                        </li>
                    ))}
                </ul>
            )}

            <button
                 onClick={runPythonScript}
                 className="w-full mt-4 px-5 py-2 bg-teal-500 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out"
             >
                 Run Python Script
             </button>
            
            <div className="mt-[30px]">
                {"Buttons below aren't working yet!"}
            </div>

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
        </div>
    );
}
