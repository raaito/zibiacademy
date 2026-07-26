import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="login-wrapper">
          <div className="glass-panel" style={{ padding: '3rem', maxWidth: '600px', textAlign: 'center' }}>
            <span style={{ fontSize: '3rem', color: '#ff4d4f' }}>⚠️</span>
            <h2 style={{ color: 'var(--text-ivory)', marginTop: '1rem', marginBottom: '1rem' }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              className="btn-premium primary"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              style={{ width: '100%' }}
            >
              Return to Login
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
