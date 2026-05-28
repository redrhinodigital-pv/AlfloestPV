import React, { useState, useEffect } from 'react';

export default function Dashboard({
  userProfile,
  onLogout,
  onCreateRoomClick,
  onJoinRoomClick,
  onRejoinRoom,
}) {
  const [roomHistory, setRoomHistory] = useState([]);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('alfloest_room_history') || '[]');
    // Sort by last visited timestamp (descending)
    history.sort((a, b) => b.lastVisited - a.lastVisited);
    setRoomHistory(history);
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="dashboard-container glass-panel">
      <div className="dashboard-header">
        <div className="user-badge">
          {userProfile.picture ? (
            <img
              src={userProfile.picture}
              alt={userProfile.name}
              className="user-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="user-avatar"
              style={{
                background: 'var(--primary-neon)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
              }}
            >
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="user-info">
            <div className="user-name">{userProfile.name}</div>
            <div className="user-email">{userProfile.email}</div>
          </div>
        </div>

        <button className="btn-logout" onClick={onLogout}>
          Sign Out
        </button>
      </div>

      <div className="dashboard-actions">
        <div className="action-card">
          <h3>Create PV Room</h3>
          <p>
            Create a secure private space. All chat logs, images, and files will be stored directly inside your own Google Drive.
          </p>
          <button className="btn-primary" onClick={onCreateRoomClick} style={{ width: '100%' }}>
            Start New Room
          </button>
        </div>

        <div className="action-card">
          <h3>Join PV Room</h3>
          <p>
            Connect to an existing chat room created by a friend. You will write and read directly from their Google Drive space.
          </p>
          <button className="btn-secondary" onClick={onJoinRoomClick} style={{ width: '100%' }}>
            Paste Room ID
          </button>
        </div>
      </div>

      <div className="room-history-section">
        <h4 className="room-history-title">Recent Chats</h4>
        <div className="history-list">
          {roomHistory.length > 0 ? (
            roomHistory.map((room) => (
              <div
                key={room.folderId}
                className="history-item"
                onClick={() => onRejoinRoom(room)}
              >
                <div className="history-item-details">
                  <div className="history-room-name">{room.roomName}</div>
                  <div className="history-room-code">{room.roomCode}</div>
                </div>
                <div className="history-item-meta">
                  <span className={`history-badge ${room.isCreator ? 'badge-creator' : 'badge-joiner'}`}>
                    {room.isCreator ? 'Host' : 'Guest'}
                  </span>
                  <div className="history-date">{formatDate(room.lastVisited)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="history-empty">
              No recent rooms found. Create a room or join your friend's room to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
