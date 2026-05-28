import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import MessageBubble from './MessageBubble';
import UploadPreview from './UploadPreview';
import {
  listMessages,
  uploadTextMessage,
  uploadBinaryFile,
  uploadMediaMessage,
} from '../googleDriveHelper';

export default function ChatRoom({ roomDetails, userProfile, token, onExitRoom }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Staged attachment upload state
  const [stagedFile, setStagedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  
  // Media Blob URL cache to prevent re-downloads across poll cycles
  const [mediaCache, setMediaCache] = useState({});
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Keep track of loaded message IDs to avoid fetching their content again
  const loadedMessageFileIds = useRef(new Set());

  // Polling effect
  useEffect(() => {
    let active = true;
    let pollInterval = null;

    const syncMessages = async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      try {
        const newMsgs = await listMessages(
          token,
          roomDetails.folderIds.messages,
          loadedMessageFileIds.current
        );

        if (!active) return;

        if (newMsgs.length > 0) {
          // Add new IDs to tracker
          newMsgs.forEach((msg) => {
            if (msg.gdriveFileId) {
              loadedMessageFileIds.current.add(msg.gdriveFileId);
            }
          });

          // Check if scroll is currently at bottom before adding messages
          const scroller = scrollerRef.current;
          const shouldScroll = scroller
            ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 100
            : true;

          setMessages((prev) => {
            const combined = [...prev, ...newMsgs];
            // Remove duplicates just in case
            const unique = [];
            const seen = new Set();
            combined.forEach((m) => {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                unique.push(m);
              }
            });
            // Sort by timestamp
            unique.sort((a, b) => a.timestamp - b.timestamp);
            return unique;
          });

          // If initial load or user was at bottom, trigger auto-scroll
          if (isInitialLoad.current || shouldScroll) {
            setTimeout(() => {
              scrollToBottom('smooth');
            }, 100);
            isInitialLoad.current = false;
          }
        } else if (isInitialLoad.current) {
          isInitialLoad.current = false;
        }
      } catch (err) {
        console.error('Polling sync error:', err);
      } finally {
        if (active) {
          setIsSyncing(false);
        }
      }
    };

    // Run immediately on join
    syncMessages();

    // Start 3-second polling interval
    pollInterval = setInterval(syncMessages, 3000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [token, roomDetails]);

  const scrollToBottom = (behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (isSending) return;

    const textToSend = inputText.trim();

    // Do nothing if both input and files are empty
    if (!textToSend && !stagedFile) return;

    setIsSending(true);

    try {
      if (stagedFile) {
        // 1. Determine media type
        let mediaType = 'file';
        if (stagedFile.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (stagedFile.type.startsWith('video/')) {
          mediaType = 'video';
        }

        // 2. Upload raw binary file to target media folder
        let targetFolderId = roomDetails.folderIds.files;
        if (mediaType === 'image') targetFolderId = roomDetails.folderIds.images;
        if (mediaType === 'video') targetFolderId = roomDetails.folderIds.videos;

        const uploadResult = await uploadBinaryFile(
          token,
          targetFolderId,
          stagedFile,
          (percent) => {
            setUploadProgress(percent);
          }
        );

        // 3. Create the JSON media message pointing to the uploaded Google Drive ID
        await uploadMediaMessage(
          token,
          roomDetails.folderIds.messages,
          userProfile,
          mediaType,
          uploadResult.fileId,
          stagedFile.name
        );

        // Clear attachment staging
        setStagedFile(null);
        setUploadProgress(null);
      } else {
        // Standard text message send
        await uploadTextMessage(token, roomDetails.folderIds.messages, userProfile, textToSend);
        setInputText('');
      }

      // Immediately poll to show the sent message instantly!
      triggerImmediateSync();
    } catch (err) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const triggerImmediateSync = async () => {
    try {
      const newMsgs = await listMessages(
        token,
        roomDetails.folderIds.messages,
        loadedMessageFileIds.current
      );
      if (newMsgs.length > 0) {
        newMsgs.forEach((msg) => {
          if (msg.gdriveFileId) {
            loadedMessageFileIds.current.add(msg.gdriveFileId);
          }
        });
        setMessages((prev) => {
          const combined = [...prev, ...newMsgs];
          const unique = [];
          const seen = new Set();
          combined.forEach((m) => {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              unique.push(m);
            }
          });
          unique.sort((a, b) => a.timestamp - b.timestamp);
          return unique;
        });
        setTimeout(() => {
          scrollToBottom('smooth');
        }, 80);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Hard limit of 40MB for GDrive uploads on client to avoid timeouts
      if (file.size > 40 * 1024 * 1024) {
        alert('File size exceeds the 40MB maximum recommended limit.');
        return;
      }
      setStagedFile(file);
      setUploadProgress(0);
      // Clear textbox to prioritize file send (similar to WhatsApp)
      setInputText('');
    }
  };

  const handleCacheMedia = (fileId, blobUrl) => {
    setMediaCache((prev) => ({
      ...prev,
      [fileId]: blobUrl,
    }));
  };

  return (
    <div className="chat-room-layout">
      {/* Sidebar drawer panel */}
      <Sidebar
        roomDetails={roomDetails}
        messages={messages}
        userProfile={userProfile}
        onExitRoom={onExitRoom}
        isOpenMobile={isMobileSidebarOpen}
      />

      {/* Main chat window container */}
      <div className="chat-pane" onClick={() => setIsMobileSidebarOpen(false)}>
        {/* Chat Pane Header */}
        <header className="chat-pane-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* Mobile Menu Toggle Button */}
            <button
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                width: '38px',
                height: '38px',
                borderRadius: '8px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsMobileSidebarOpen(!isMobileSidebarOpen);
              }}
            >
              ☰
            </button>
            <div className="chat-header-info">
              <h3 className="chat-header-title">{roomDetails.roomName}</h3>
              <div className="sync-status">
                <span className={`sync-dot ${isSyncing ? 'syncing' : ''}`}></span>
                {isSyncing ? 'Syncing with Drive...' : 'Live Sync Connected'}
              </div>
            </div>
          </div>
        </header>

        {/* Scrolling Message List Panel */}
        <div className="messages-scroller" ref={scrollerRef}>
          {messages.length > 0 ? (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                token={token}
                isSent={msg.sender.email === userProfile.email}
                mediaCache={mediaCache}
                onCacheMedia={handleCacheMedia}
              />
            ))
          ) : (
            <div className="no-messages-prompt">
              <div className="no-messages-icon">💬</div>
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: '6px' }}>Empty Chat Room</h4>
              <p>No messages yet. Send a secure text or upload a media attachment to start chatting!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Fixed Footer Input Bar */}
        <footer className="chat-input-area">
          {/* Staged file progress bars */}
          {stagedFile && (
            <UploadPreview
              file={stagedFile}
              progress={uploadProgress}
              onCancel={() => {
                setStagedFile(null);
                setUploadProgress(null);
              }}
            />
          )}

          <form onSubmit={handleSendMessage} className="input-row">
            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="file-input-hidden"
            />

            {/* Attachment trigger */}
            <button
              type="button"
              className="btn-attachment"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              title="Add attachment (Image, Video, or File)"
            >
              📎
            </button>

            {/* Main Text Input */}
            <input
              type="text"
              className="chat-text-input"
              placeholder={
                stagedFile
                  ? 'Click send to upload the attachment...'
                  : 'Type a secure message...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isSending || stagedFile !== null}
            />

            {/* Submit Send Button */}
            <button
              type="submit"
              className="btn-send"
              disabled={isSending || (!inputText.trim() && !stagedFile)}
              title="Send secure message"
            >
              {isSending ? (
                <span className="media-spinner" style={{ width: '16px', height: '16px' }}></span>
              ) : (
                '➤'
              )}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
