import React, { useState, useEffect } from 'react';
import { downloadFileAsBlobUrl } from '../googleDriveHelper';

export default function MessageBubble({ message, token, isSent, mediaCache, onCacheMedia }) {
  const [mediaSrc, setMediaSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { sender, type, text, fileId, timestamp } = message;

  useEffect(() => {
    // Check if we need to load media and if it's already in the cache
    if ((type === 'image' || type === 'video') && fileId) {
      if (mediaCache && mediaCache[fileId]) {
        setMediaSrc(mediaCache[fileId]);
        return;
      }

      // Fetch blob URL lazy loader
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

  return (
    <div className={`message-row ${isSent ? 'sent' : 'received'}`}>
      {/* Sender Avatar */}
      {!isSent && (
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

      {/* Message Bubble Wrapper */}
      <div className="msg-bubble-wrapper">
        {!isSent && <span className="msg-sender-name">{sender.name}</span>}

        <div className="msg-bubble">
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

        <span className="msg-time">{formatTime(timestamp)}</span>
      </div>
    </div>
  );
}
