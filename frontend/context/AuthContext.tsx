'use client';

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { getMe, logout as apiLogout, PublicUser } from '@/lib/auth-api';
import { setSessionExpiredHandler } from '@/lib/api-client';

type AuthContextType = {
    user: PublicUser | null;
    loading: boolean;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Calls /users/me once on mount (middleware already guarantees the session
// cookie exists for anything inside this provider — this is what confirms
// the backend still considers it valid, and gets the username for the
// header). Also registers the global session-expired handler for as long
// as this provider is mounted, so a 401 from any proxied call anywhere in
// the app sends the user back to /login instead of failing silently.
export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        getMe()
            .then((fetchedUser) => {
                if (!cancelled) setUser(fetchedUser);
            })
            .catch(() => {
                if (!cancelled) setUser(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setSessionExpiredHandler(() => {
            setUser(null);
            // The session cookie is httpOnly (client JS can't clear it), so
            // if we only router.push here, middleware.ts's cookie-presence
            // check sees the still-there-but-invalid cookie and immediately
            // bounces /login back to /home. Call the real logout endpoint
            // first so the server actually clears it via Set-Cookie.
            apiLogout()
                .catch(() => {})
                .finally(() => router.push('/login?sessionExpired=1'));
        });
        return () => setSessionExpiredHandler(null);
    }, [router]);

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            setUser(null);
            router.push('/login');
        }
    }, [router]);

    return (
        <AuthContext.Provider value={{ user, loading, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
