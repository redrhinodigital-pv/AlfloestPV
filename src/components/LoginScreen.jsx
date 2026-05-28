import React, { useState } from 'react';
import { loginWithGoogle } from '../googleDriveHelper';

const DEFAULT_CLIENT_ID = '953186837803-qfbe987178lhvmo3d23rm8t7tvd652m8.apps.googleusercontent.com';

export default function LoginScreen({ onLoginSuccess }) {
  const [clientId, setClientId] = useState(() => {
    return localStorage.getItem('alfloest_client_id') || DEFAULT_CLIENT_ID;
  });
  const [showDevSettings, setShowDevSettings] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginClick = () => {
    setIsLoading(true);
    setError(null);
    try {
      loginWithGoogle();
    } catch (err) {
      setIsLoading(false);
      setError(err.message || 'Auth flow failed to launch. Ensure Client ID is valid.');
    }
  };

  const handleClientIdSave = (e) => {
    e.preventDefault();
    const newId = e.target.clientIdInput.value.trim();
    if (newId) {
      setClientId(newId);
      localStorage.setItem('alfloest_client_id', newId);
      setShowDevSettings(false);
      setError(null);
      // Reload page to re-initialize client globally in App.jsx
      window.location.reload();
    }
  };

  return (
    <div className="login-screen glass-panel">
      <div className="login-logo">ALFLOEST PV</div>
      <div className="login-subtitle">
        A serverless, 100% private chat system backed entirely by your own Google Drive.
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '0.85rem',
          marginBottom: '20px',
          textAlign: 'left',
          width: '100%',
          lineHeight: '1.4'
        }}>
          <strong>Configuration Error:</strong><br />
          {error}
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: '100%', height: '52px', fontSize: '1.05rem' }}
        onClick={handleLoginClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="media-spinner" style={{ width: '16px', height: '16px' }}></span>
            Connecting to Google...
          </>
        ) : (
          <>
            <svg style={{ width: '20px', height: '20px', fill: 'currentColor' }} viewBox="0 0 24 24">
              <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.985 0-.746-.08-1.32-.176-1.884H12.24z"/>
            </svg>
            Continue with Google
          </>
        )}
      </button>

      <button
        className="dev-settings-toggle"
        onClick={() => setShowDevSettings(!showDevSettings)}
      >
        {showDevSettings ? 'Hide Developer Settings' : 'Developer Settings (Configure OAuth Client ID)'}
      </button>

      {showDevSettings && (
        <form className="dev-settings-pane" onSubmit={handleClientIdSave}>
          <div className="input-group">
            <label className="input-label" htmlFor="clientIdInput">
              Google OAuth Client ID
            </label>
            <input
              type="text"
              id="clientIdInput"
              name="clientIdInput"
              defaultValue={clientId}
              className="input-field"
              style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
              placeholder="Enter your custom Google Client ID"
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              onClick={() => setShowDevSettings(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Apply & Refresh
            </button>
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'left',
            marginTop: '10px',
            lineHeight: '1.4'
          }}>
            * Ensure the Authorized JavaScript origins in your Google Developer Console contain:
            <br />• <code>http://localhost:5173</code>
            <br />• <code>http://localhost:5174</code>
            <br />• <code>https://alfloest-pv.vercel.app</code>
          </div>
        </form>
      )}
    </div>
  );
}
