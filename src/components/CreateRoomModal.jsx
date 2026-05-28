import React, { useState } from 'react';

export default function CreateRoomModal({ isOpen, onClose, onCreateRoom }) {
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) {
      setError('Please provide a name for your private room.');
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      await onCreateRoom(name);
      setRoomName('');
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create room. Please verify your Google Drive permissions.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <h2 className="modal-header">Create PV Room</h2>
        <p className="modal-desc">
          Set up a serverless room in your Google Drive. We will automatically create folders for messages, images, and files, and share them securely.
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
            <label className="input-label" htmlFor="roomNameInput">
              Room Name
            </label>
            <input
              type="text"
              id="roomNameInput"
              className="input-field"
              placeholder="e.g. Secret Project Discussion"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              disabled={isCreating}
              autoFocus
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <span className="media-spinner" style={{ width: '14px', height: '14px' }}></span>
                  Creating folders...
                </>
              ) : (
                'Create Room'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
