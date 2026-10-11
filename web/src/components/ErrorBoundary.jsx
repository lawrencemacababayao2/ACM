import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      console.error('ErrorBoundary caught:', this.state.error);
      return (
        <div className="content">
          <div className="card" style={{ maxWidth: 640, margin: '60px auto' }}>
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <pre className="muted" style={{ whiteSpace: 'pre-wrap', overflow: 'auto' }}>
              {String(this.state.error.message || this.state.error)}
              {'\n\n'}
              {String(this.state.error.stack || '')}
            </pre>
            <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}