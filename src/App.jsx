import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthFlow from './components/AuthFlow'
import SuperAdminFlow from './components/SuperAdminFlow'
import ExaminerFlow from './components/ExaminerFlow'
import StudentFlow from './components/StudentFlow'
import AdminCandidatesFlow from './components/AdminCandidatesFlow'
import RegisterFlow from './components/RegisterFlow'
import StaffRegisterFlow from './components/StaffRegisterFlow'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { Toaster } from 'react-hot-toast'
import './App.css'

const Navigation = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    if (profile) {
      await supabase.from('profiles').update({ session_token: null }).eq('id', profile.id);
    }
    localStorage.removeItem('zibi_session_token');
    await supabase.auth.signOut();
    setIsMenuOpen(false);
    navigate('/');
  };

  return (
    <nav className="elite-nav">
      <div className="logo-section">
        <img src="/logo.png" alt="dtmd academy logo" className="logo-emblem" />
        <h1 className="logo-text">DTMD Academy</h1>
      </div>

      <button 
        className="mobile-menu-toggle" 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Toggle Navigation"
      >
        {isMenuOpen ? '✕' : '☰'}
      </button>

      <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
        {user ? (
          <>
            {profile?.role === 'superadmin' && (
              <>
                <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Admin Console</Link>
                <Link to="/examiner" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Examiner Portal</Link>
                <Link to="/candidates" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Candidates View</Link>
              </>
            )}
            {profile?.role === 'examiner' && (
              <Link to="/examiner" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Examiner Portal</Link>
            )}
            {profile?.role === 'candidate' && (
              <Link to="/student" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Candidate Portal</Link>
            )}
            <span className="user-welcome">
              Welcome, {profile?.full_name || user.email}
            </span>
            <span
              onClick={handleLogout}
              className="sign-out-btn"
            >
              Sign Out
            </span>
          </>
        ) : (
          <>
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold">Login</Link>
            <Link to="/register" onClick={() => setIsMenuOpen(false)} className="nav-item hover-gold register-btn">Register Now</Link>
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
            <Route path="/" element={<ErrorBoundary><AuthFlow /></ErrorBoundary>} />
            <Route path="/register" element={<ErrorBoundary><RegisterFlow /></ErrorBoundary>} />
            <Route path="/staff/register" element={<ErrorBoundary><StaffRegisterFlow /></ErrorBoundary>} />

            <Route path="/admin/*" element={
              <ErrorBoundary>
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <SuperAdminFlow />
                </ProtectedRoute>
              </ErrorBoundary>
            } />

            <Route path="/examiner/*" element={
              <ErrorBoundary>
                <ProtectedRoute allowedRoles={['examiner', 'superadmin']}>
                  <ExaminerFlow />
                </ProtectedRoute>
              </ErrorBoundary>
            } />

            <Route path="/student/*" element={
              <ErrorBoundary>
                <ProtectedRoute allowedRoles={['candidate']}>
                  <StudentFlow />
                </ProtectedRoute>
              </ErrorBoundary>
            } />

            <Route path="/candidates/*" element={
              <ErrorBoundary>
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <AdminCandidatesFlow />
                </ProtectedRoute>
              </ErrorBoundary>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
