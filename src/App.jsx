import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthFlow from './components/AuthFlow'
import SuperAdminFlow from './components/SuperAdminFlow'
import ExaminerFlow from './components/ExaminerFlow'
import StudentFlow from './components/StudentFlow'
import AdminCandidatesFlow from './components/AdminCandidatesFlow'
import RegisterFlow from './components/RegisterFlow'
import ProtectedRoute from './components/ProtectedRoute'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { Toaster } from 'react-hot-toast'
import './App.css'

const Navigation = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="elite-nav">
      <div className="logo-section">
        <img src="/logo.png" alt="zibi academy logo" className="logo-emblem" />
        <h1 className="logo-text">zibi academy</h1>
      </div>
      <div className="nav-links">
        {user ? (
          <>
            {profile?.role === 'superadmin' && (
              <>
                <Link to="/admin" style={{ color: 'var(--text-ivory)', marginRight: '1rem', textDecoration: 'none' }} className="nav-item hover-gold">Admin Console</Link>
                <Link to="/examiner" style={{ color: 'var(--text-ivory)', marginRight: '1rem', textDecoration: 'none' }} className="nav-item hover-gold">Examiner Portal</Link>
                <Link to="/candidates" style={{ color: 'var(--text-ivory)', marginRight: '1rem', textDecoration: 'none' }} className="nav-item hover-gold">Candidates View</Link>
              </>
            )}
            {profile?.role === 'examiner' && (
              <Link to="/examiner" style={{ color: 'var(--text-ivory)', marginRight: '1rem', textDecoration: 'none' }} className="nav-item hover-gold">Examiner Portal</Link>
            )}
            {profile?.role === 'candidate' && (
              <Link to="/student" style={{ color: 'var(--text-ivory)', marginRight: '1rem', textDecoration: 'none' }} className="nav-item hover-gold">Candidate Portal</Link>
            )}
            <span style={{ color: '#aaa', marginRight: '1rem' }}>
              Welcome, {profile?.full_name || user.email} ({profile?.role})
            </span>
            <span
              onClick={handleLogout}
              style={{ cursor: 'pointer', color: '#ff4d4f' }}
            >
              Sign Out
            </span>
          </>
        ) : (
          <>
            <Link to="/" style={{ color: 'var(--text-ivory)', marginRight: '1.5rem', textDecoration: 'none' }} className="nav-item hover-gold">Login</Link>
            <Link to="/register" style={{ color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 'bold' }} className="nav-item hover-gold">Register Now</Link>
          </>
        )}
      </div>
    </nav>
  );
};

function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="elite-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px' }}>
          <span style={{ fontSize: '3rem', color: '#ff4d4f' }}>⚠️</span>
          <h2 style={{ color: 'var(--text-ivory)', marginTop: '1rem', marginBottom: '1rem' }}>Missing Database Configuration</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set.
            The system cannot render without an active database connection.
          </p>
          <p style={{ color: 'var(--accent-gold)', marginTop: '1rem', background: 'rgba(255, 215, 0, 0.1)', padding: '1rem', borderRadius: '4px' }}>
            Please rename <strong>.env.example</strong> to <strong>.env</strong>, fill in your credentials, and restart the server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--bg-obsidian)',
              color: 'var(--text-ivory)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-body)',
            },
            success: {
              iconTheme: { primary: '#00cc66', secondary: 'var(--bg-obsidian)' },
              style: { border: '1px solid #00cc66' }
            },
            error: {
              iconTheme: { primary: '#ff4d4f', secondary: 'var(--bg-obsidian)' },
              style: { border: '1px solid #ff4d4f' }
            }
          }}
        />
        <div className="elite-container">
          <Navigation />
          <Routes>
            <Route path="/" element={<AuthFlow />} />
            <Route path="/register" element={<RegisterFlow />} />

            <Route path="/admin/*" element={
              <ProtectedRoute allowedRoles={['superadmin']}>
                <SuperAdminFlow />
              </ProtectedRoute>
            } />

            <Route path="/examiner/*" element={
              <ProtectedRoute allowedRoles={['examiner', 'superadmin']}>
                <ExaminerFlow />
              </ProtectedRoute>
            } />

            <Route path="/student/*" element={
              <ProtectedRoute allowedRoles={['candidate']}>
                <StudentFlow />
              </ProtectedRoute>
            } />

            <Route path="/candidates/*" element={
              <ProtectedRoute allowedRoles={['superadmin']}>
                <AdminCandidatesFlow />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
