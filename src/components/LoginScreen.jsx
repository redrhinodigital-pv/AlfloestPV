import React from 'react';

export default function LoginScreen({ handleLoginClick, isLoading, error }) {
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

      {new URLSearchParams(window.location.search).get('room') && (
        <div style={{
          background: 'rgba(168, 85, 247, 0.1)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '0.85rem',
          color: 'var(--primary-neon-bright)',
          lineHeight: '1.4',
          textAlign: 'left'
        }}>
          💌 <strong>Room Invitation Received!</strong><br />
          You have been invited to join a secure private room. Sign in with Google to enter instantly.
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: '100%', height: '52px', fontSize: '1.05rem', marginTop: '10px' }}
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
    </div>
  );
}
