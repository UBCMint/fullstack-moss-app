'use client'

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { User } from './types'; // Adjust the path as necessary

export default function Form() {
    const [name, setName] = useState("");
    const [response, setResponse] = useState("");
    const [users, setUsers] = useState<User[]>([]);

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

    return (
        <div className="max-w-md mx-auto p-5 border border-gray-300 rounded-lg bg-gray-800">
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
