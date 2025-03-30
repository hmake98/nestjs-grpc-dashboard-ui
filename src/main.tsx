import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import './index.css';
import App from './app';

// Error boundary component for catching and displaying runtime errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // You can log the error to an error reporting service here
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px',
            margin: '20px',
            border: '1px solid #f5222d',
            borderRadius: '4px',
            backgroundColor: '#fff1f0',
          }}
        >
          <h2>Something went wrong</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>Show error details</summary>
            <p>{this.state.error?.message}</p>
            <p>{this.state.error?.stack}</p>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              background: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Load saved theme preference from localStorage
const getThemePreference = (): 'light' | 'dark' => {
  const savedSettings = localStorage.getItem('grpcDashboardSettings');
  if (savedSettings) {
    try {
      const { darkMode } = JSON.parse(savedSettings);
      return darkMode ? 'dark' : 'light';
    } catch (error) {
      console.error('Failed to parse saved theme settings:', error);
    }
  }
  return 'light';
};

// Create App with proper theme configuration
const root = ReactDOM.createRoot(document.getElementById('root')!);

// Use the ConfigProvider to apply theme settings
const themeType = getThemePreference();
const themeConfig = {
  algorithm: themeType === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 6,
  },
};

// Render app with all providers
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider theme={themeConfig}>
        <AntApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
