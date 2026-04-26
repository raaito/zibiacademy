import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#fff' }}>
        <p>Verifying Identity...</p>
      </div>
    );
  }

  if (!user || !profile) {
    // Not logged in, redirect to auth
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    // Logged in but wrong role, redirect to appropriate dashboard or auth
    if (profile.role === 'superadmin') return <Navigate to="/admin" replace />;
    if (profile.role === 'examiner') return <Navigate to="/examiner" replace />;
    if (profile.role === 'candidate') return <Navigate to="/student" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
