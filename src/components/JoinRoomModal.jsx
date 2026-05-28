import React, { useState } from 'react';

export default function JoinRoomModal({ isOpen, onClose, onJoinRoom }) {
  const [roomId, setRoomId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = roomId.trim();
    if (!id) {
      setError('Please provide a Room ID or Invite Link.');
      return;
    }

    setIsJoining(true);
    setError('');
    try {
      await onJoinRoom(id);
      setRoomId('');
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to join room. Verify the Room ID or your connection.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <h2 className="modal-header">Join PV Room</h2>
        <p className="modal-desc">
          Paste the Room ID or the complete Share Invite Link that the room host sent you.
        </p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            marginBottom: '15px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="roomIdInput">
              Room ID or Invite Link
            </label>
            <input
              type="text"
              id="roomIdInput"
              className="input-field"
              placeholder="e.g. 1a2b3c4d5e6f7g8h... or URL"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={isJoining}
              autoFocus
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isJoining}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isJoining}
            >
              {isJoining ? (
                <>
                  <span className="media-spinner" style={{ width: '14px', height: '14px' }}></span>
                  Resolving room...
                </>
              ) : (
                'Join Room'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
