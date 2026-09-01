import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, false);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Background re-fetch without setting loading=true to prevent unmounting active UI states on tab switch
        fetchProfile(session.user.id, true);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId, isBackground = false) => {
    if (!isBackground || !profile) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId);

      if (error) {
        console.error("Error fetching profile:", error);
        setError(error.message);
      } else if (!data || data.length === 0) {
        setError(`No profile found for UID: ${userId.substring(0, 8)}... Please verify your database records.`);
      } else if (data.length > 1) {
        console.warn("Multiple profiles found for user:", userId);
        setProfile(data[0]);
        setError(null);
      } else {
        const prof = data[0];

        if (prof.role === 'candidate' && !signingOut) {
          const localToken = localStorage.getItem('zibi_session_token');

          if (prof.session_token && prof.session_token !== localToken) {
            if (!localToken) {
              localStorage.setItem('zibi_session_token', prof.session_token);
            } else {
              setSigningOut(true);
              await supabase.auth.signOut();
              localStorage.removeItem('zibi_session_token');
              //setError('This account is already logged in from another device. Only one active session is allowed.');
              setError('Unable to log in.');
              setProfile(null);
              setUser(null);
              setSession(null);
              setSigningOut(false);
              setLoading(false);
              return;
            }
          }

          if (!prof.session_token) {
            const newToken = crypto.randomUUID();
            await supabase.from('profiles').update({ session_token: newToken }).eq('id', prof.id);
            localStorage.setItem('zibi_session_token', newToken);
            prof.session_token = newToken;
          }
        }

        setProfile(prof);
        setError(null);
      }
    } catch (err) {
      console.error("Unexpected error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    session,
    user,
    profile,
    loading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
