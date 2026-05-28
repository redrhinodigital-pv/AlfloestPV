import React, { useState } from 'react';

export default function Sidebar({
  roomDetails,
  messages,
  userProfile,
  onExitRoom,
  isOpenMobile,
}) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Compile participants list
  const getParticipants = () => {
    const list = new Map();

    // 1. Add room creator from metadata if present
    if (roomDetails.creator) {
      list.set(roomDetails.creator.email, {
        name: roomDetails.creator.name,
        email: roomDetails.creator.email,
        picture: roomDetails.creator.picture,
        isCreator: true,
      });
    }

    // 2. Add current user
    list.set(userProfile.email, {
      name: userProfile.name,
      email: userProfile.email,
      picture: userProfile.picture,
      isCreator: roomDetails.creator?.email === userProfile.email,
    });

    // 3. Add senders from messages
    messages.forEach((msg) => {
      if (msg.sender && msg.sender.email) {
        const isHost = roomDetails.creator?.email === msg.sender.email;
        if (!list.has(msg.sender.email)) {
          list.set(msg.sender.email, {
            name: msg.sender.name,
            email: msg.sender.email,
            picture: msg.sender.picture,
            isCreator: isHost,
          });
        }
      }
    });

    return Array.from(list.values());
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(roomDetails.packedId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/?room=${roomDetails.folderId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const participants = getParticipants();

  return (
    <aside className={`sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          Alfloest<span>PV</span>
        </div>
        <div className="sidebar-room-name" title={roomDetails.roomName}>
          {roomDetails.roomName}
        </div>

        <button className="sidebar-room-code-badge" onClick={handleCopyId}>
          <span>Code: {roomDetails.roomCode}</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
            {copiedId ? 'Copied ✓' : 'Copy'}
          </span>
        </button>
      </div>

      <div className="sidebar-scroll-area">
        <div className="sidebar-section-title">Participants ({participants.length})</div>
        <div className="participant-list">
          {participants.map((person) => (
            <div key={person.email} className="participant-item">
              {person.picture ? (
                <img
                  src={person.picture}
                  alt={person.name}
                  className="participant-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="participant-avatar"
                  style={{
                    background: person.isCreator ? 'var(--primary-neon)' : 'var(--accent-pink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                  }}
                >
                  {person.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="participant-info">
                <div className="participant-name">
                  {person.name} {person.email === userProfile.email && '(You)'}
                </div>
                <div className="participant-badge">
                  {person.isCreator ? 'Host' : 'Guest'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          className="btn-secondary"
          onClick={handleCopyLink}
          style={{ width: '100%', fontSize: '0.85rem' }}
        >
          {copiedLink ? 'Invite Link Copied! ✓' : 'Copy Invite Link'}
        </button>
        <button
          className="btn-secondary"
          onClick={onExitRoom}
          style={{
            width: '100%',
            fontSize: '0.85rem',
            borderColor: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
          }}
        >
          Exit Chat Room
        </button>
      </div>
    </aside>
  );
}
