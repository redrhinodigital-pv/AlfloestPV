import React, { useState, useEffect } from 'react';
import { downloadFileAsBlobUrl } from '../googleDriveHelper';

export default function MessageBubble({
  message,
  token,
  isSent,
  mediaCache,
  onCacheMedia,
  isGrouped = false,
  onReplyTrigger,
  onForwardTrigger,
}) {
  const [mediaSrc, setMediaSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { id, sender, type, text, fileId, timestamp, replyTo, sending, failed } = message;

  useEffect(() => {
    // Check if we need to lazy load media
    if ((type === 'image' || type === 'video') && fileId) {
      if (mediaCache && mediaCache[fileId]) {
        setMediaSrc(mediaCache[fileId]);
        return;
      }

      let active = true;
      const fetchMedia = async () => {
        setLoading(true);
        setError(null);
        try {
          const url = await downloadFileAsBlobUrl(token, fileId);
          if (active) {
            setMediaSrc(url);
            if (onCacheMedia) {
              onCacheMedia(fileId, url);
            }
          }
        } catch (err) {
          console.error(`Failed to lazy load media file ${fileId}:`, err);
          if (active) {
            setError('Failed to download media');
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      fetchMedia();

      return () => {
        active = false;
      };
    }
  }, [fileId, type, token, mediaCache, onCacheMedia]);

  const handleFileDownload = async (e) => {
    e.preventDefault();
    if (!fileId) return;

    if (mediaCache && mediaCache[fileId]) {
      triggerBrowserDownload(mediaCache[fileId], text);
      return;
    }

    setLoading(true);
    try {
      const url = await downloadFileAsBlobUrl(token, fileId);
      if (onCacheMedia) {
        onCacheMedia(fileId, url);
      }
      triggerBrowserDownload(url, text);
    } catch (err) {
      alert(`Could not download file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerBrowserDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (time) => {
    const date = new Date(time);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleQuoteClick = () => {
    if (replyTo?.id) {
      const el = document.getElementById(replyTo.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a temporary glow animation
        el.classList.add('glow-highlight');
        setTimeout(() => el.classList.remove('glow-highlight'), 1500);
      }
    }
  };

  return (
    <div
      id={id}
      className={`message-row ${isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''}`}
      style={{ marginBottom: isGrouped ? '3px' : '12px' }}
    >
      {/* Sender Avatar - Hidden on grouped or sent messages */}
      {!isSent && !isGrouped && (
        sender.picture ? (
          <img
            src={sender.picture}
            alt={sender.name}
            className="msg-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="msg-avatar"
            style={{
              background: 'var(--primary-neon-bright)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              color: '#fff',
            }}
          >
            {sender.name.charAt(0).toUpperCase()}
          </div>
        )
      )}
      
      {/* Placeholder space to align grouped received messages without avatar */}
      {!isSent && isGrouped && <div style={{ width: '36px', flexShrink: 0 }} />}

      {/* Message Bubble Wrapper */}
      <div className="msg-bubble-wrapper">
        {!isSent && !isGrouped && <span className="msg-sender-name">{sender.name}</span>}

        <div className="msg-bubble-container-relative">
          <div
            className="msg-bubble"
            onDoubleClick={() => onReplyTrigger && onReplyTrigger(message)}
            title="Double-click to reply"
          >
            {/* Replies Quote Panel */}
            {replyTo && (
              <div className="msg-reply-quote-box" onClick={handleQuoteClick}>
                <div className="msg-reply-quote-sender">{replyTo.senderName}</div>
                <div className="msg-reply-quote-text">{replyTo.text}</div>
              </div>
            )}

            {/* Text message */}
            {type === 'text' && <p>{text}</p>}

            {/* Image media */}
            {type === 'image' && (
              <div className="msg-media-container">
                {loading && (
                  <div className="media-loader">
                    <div className="media-spinner"></div>
                    <span>Downloading Image...</span>
                  </div>
                )}
                {error && <div className="media-loader" style={{ color: '#ef4444' }}>⚠️ {error}</div>}
                {mediaSrc && !loading && !error && (
                  <img src={mediaSrc} alt="attachment" className="msg-media-img" />
                )}
              </div>
            )}

            {/* Video media */}
            {type === 'video' && (
              <div className="msg-media-container">
                {loading && (
                  <div className="media-loader">
                    <div className="media-spinner"></div>
                    <span>Downloading Video...</span>
                  </div>
                )}
                {error && <div className="media-loader" style={{ color: '#ef4444' }}>⚠️ {error}</div>}
                {mediaSrc && !loading && !error && (
                  <video src={mediaSrc} controls className="msg-media-video" />
                )}
              </div>
            )}

            {/* General file attachment */}
            {type === 'file' && (
              <div className="msg-file-download-box" onClick={handleFileDownload}>
                <span className="msg-file-icon">📄</span>
                <div className="msg-file-meta">
                  <span className="msg-file-name" title={text}>
                    {text}
                  </span>
                  <span className="msg-file-action">
                    {loading ? 'Downloading...' : 'Click to Download'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Hover Actions Menu */}
          <div className="msg-hover-actions">
            <button
              className="hover-action-btn"
              onClick={() => onReplyTrigger && onReplyTrigger(message)}
              title="Reply"
            >
              ↶
            </button>
            {(type === 'image' || type === 'video' || type === 'file') && (
              <button
                className="hover-action-btn"
                onClick={() => onForwardTrigger && onForwardTrigger(message)}
                title="Forward attachment"
              >
                ➔
              </button>
            )}
          </div>
        </div>

        {/* Sync / Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="msg-time">{formatTime(timestamp)}</span>
          {sending && (
            <span className="msg-status-sending" title="Sending secure file...">
              ⚡
            </span>
          )}
          {failed && (
            <span className="msg-status-failed" title="Send failed. Check connection.">
              ⚠️ Failed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
