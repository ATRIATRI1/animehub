import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAuthUser, onAuthChange, type AuthUser } from '../services/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthed: boolean;
}

const AuthCtx = createContext<AuthContextValue>({ user: null, isAuthed: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser());
  useEffect(() => onAuthChange(setUser), []);
  return (
    <AuthCtx.Provider value={{ user, isAuthed: !!user }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthCtx);
}
