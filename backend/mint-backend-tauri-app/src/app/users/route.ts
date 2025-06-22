import { NextResponse } from 'next/server';
import { User } from '../types'; // Adjust the path as necessary


export async function GET() {
  // Mock user data
  const users: User[] = [
    { id: 1, name: 'Jayden', email: 'Jayden_codes@real.com' },
    { id: 2, name: 'Priyanshu', email: 'PRIYANSHU_theGoat@factchecker.com' },
    { id: 3, name: 'Trevor', email: 'yea@real.com' }
  ];

  return NextResponse.json(users); // Respond with JSON data
}