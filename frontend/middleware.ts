import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'moss_session';
const AUTH_PAGES = ['/login', '/signup'];

// Only checks that the cookie exists — the back-end (AuthUser extractor) is
// the one that decides whether it's actually still valid. A present-but-
// expired cookie gets past this and is caught by the getMe() 401 handling
// in AuthContext instead.
export function middleware(request: NextRequest) {
    const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/home') && !hasSessionCookie) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (AUTH_PAGES.includes(pathname) && hasSessionCookie) {
        return NextResponse.redirect(new URL('/home', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/home/:path*', '/login', '/signup'],
};
