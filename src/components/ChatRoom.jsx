import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import MessageBubble from './MessageBubble';
import UploadPreview from './UploadPreview';
import { getCachedMessages, cacheMessages } from '../dbHelper';
import {
  downloadMessages,
  fetchFileMetadata,
  updateMessagesJson,
  mergeMessages,
  compressImage,
  uploadTextMessage,
  uploadBinaryFile,
  uploadMediaMessage,
  updatePresenceStatus,
  listLiveStatuses,
} from '../googleDriveHelper';

export default function ChatRoom({ roomDetails, userProfile, token, onExitRoom }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionState, setConnectionState] = useState('Connecting...');
  
  // Parallel uploads queue
  const [uploadQueue, setUploadQueue] = useState([]);
  
  // Active states
  const [onlineParticipants, setOnlineParticipants] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mediaCache, setMediaCache] = useState({});
  const [dragActive, setDragActive] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Status file references in Google Drive to allow quick updates via PATCH (renaming)
  const typingFileId = useRef(null);
  const onlineFileId = useRef(null);
  
  // Throttle helper to avoid spamming typing updates
  const lastTypingTime = useRef(0);

  // Refs for tracking sync modified times
  const lastModifiedTime = useRef(null);

  // Browser online state listeners
  useEffect(() => {
    const handleOnline = () => setConnectionState('Reconnecting...');
    const handleOffline = () => setConnectionState('Offline cache mode');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 1. Initial Load: Load local messages instantly from IndexedDB cache
  useEffect(() => {
    let active = true;
    async function loadLocalCache() {
      try {
        const cached = await getCachedMessages(roomDetails.roomFolderId);
        if (active && cached.length > 0) {
          setMessages(cached);
          setTimeout(() => scrollToBottom('auto'), 50);
          isInitialLoad.current = false;
        }
      } catch (err) {
        console.error('IndexedDB load failed:', err);
      }
    }
    loadLocalCache();

    return () => {
      active = false;
    };
  }, [roomDetails]);

  // 2. Core Messaging & Direct Sync Polling Loop (Smart Sync Engine)
  useEffect(() => {
    let active = true;
    let pollInterval = null;

    const syncMessagesAndPresence = async () => {
      if (isSyncing) return;
      setIsSyncing(true);

      // Transition to syncing
      setConnectionState(prev => (prev === 'Offline cache mode' ? prev : 'Syncing...'));

      try {
        // Step 1: Lightweight check of modifiedTime of messages.json file
        const metadata = await fetchFileMetadata(token, roomDetails.messagesFileId);
        
        // Step 2: Only download and parse if modifiedTime actually changed
        const hasModifiedTimeChanged = lastModifiedTime.current !== metadata.modifiedTime;
        
        let currentMessagesList = messages;

        if (hasModifiedTimeChanged) {
          console.log(`[Smart Sync] messages.json changed (Old: ${lastModifiedTime.current}, New: ${metadata.modifiedTime}). Syncing...`);
          
          const downloaded = await downloadMessages(token, roomDetails.messagesFileId);
          const merged = mergeMessages(messages, downloaded);

          // Write updated set to local IndexedDB instantly
          await cacheMessages(roomDetails.roomFolderId, merged);

          currentMessagesList = merged;
          lastModifiedTime.current = metadata.modifiedTime;

          if (active) {
            setMessages(merged);
            
            if (isInitialLoad.current) {
              setTimeout(() => scrollToBottom('auto'), 50);
              isInitialLoad.current = false;
            } else {
              const scroller = scrollerRef.current;
              const shouldScroll = scroller
                ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120
                : true;
              if (shouldScroll) {
                setTimeout(() => scrollToBottom('smooth'), 100);
              }
            }
          }
        } else {
          console.log('[Smart Sync] messages.json unchanged. Skipping download.');
        }

        if (!active) return;

        // Poll serverless presence signaling files
        const { onlineUsers, typingUsers: activeTypers } = await listLiveStatuses(
          token,
          roomDetails.roomFolderId
        );

        if (active) {
          const cleanEmail = userProfile.email.replace(/[^a-zA-Z0-9]/g, '_');
          setOnlineParticipants(onlineUsers.filter(u => u.email !== cleanEmail));
          setTypingUsers(activeTypers.filter(u => u.email !== cleanEmail));
          setConnectionState('Connected');
        }
      } catch (err) {
        console.error('[Smart Sync] Sync execution failed:', err);
        if (active) {
          setConnectionState('Offline cache mode');
        }
      } finally {
        if (active) {
          setIsSyncing(false);
        }
      }
    };

    // Trigger instantly
    syncMessagesAndPresence();

    // Start high-performance 2-second polling loop
    pollInterval = setInterval(syncMessagesAndPresence, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [token, roomDetails, userProfile, messages]);

  // 3. Online presence heartbeats (once every 12 seconds)
  useEffect(() => {
    let active = true;
    let presenceInterval = null;

    const pulsePresence = async () => {
      if (!active) return;
      try {
        const fileId = await updatePresenceStatus(
          token,
          roomDetails.roomFolderId,
          userProfile.email,
          userProfile.name,
          'online',
          onlineFileId.current
        );
        if (active) {
          onlineFileId.current = fileId;
        }
      } catch (err) {
        console.error('Online pulse failed:', err);
      }
    };

    pulsePresence();
    presenceInterval = setInterval(pulsePresence, 12000);

    return () => {
      active = false;
      clearInterval(presenceInterval);
    };
  }, [token, roomDetails, userProfile]);

  const scrollToBottom = (behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 4. Handle Typing Indicators
  const handleTyping = () => {
    const now = Date.now();
    // Throttle presence updates to once every 4 seconds
    if (now - lastTypingTime.current > 4000) {
      lastTypingTime.current = now;
      updatePresenceStatus(
        token,
        roomDetails.roomFolderId,
        userProfile.email,
        userProfile.name,
        'typing',
        typingFileId.current
      ).then((fileId) => {
        typingFileId.current = fileId;
      }).catch(err => console.error(err));
    }
  };

  // 5. Submit Message (Optimistic UI updates)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (isSending) return;

    const textToSend = inputText.trim();
    if (!textToSend) return;

    setIsSending(true);
    setInputText('');

    const tempId = `msg_temp_${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      sender: userProfile,
      type: 'text',
      text: textToSend,
      timestamp: Date.now(),
      replyTo: replyTarget,
      sending: true,
    };

    // Add message instantly (0ms latency!)
    setMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Clear quote target
    setReplyTarget(null);

    try {
      setConnectionState('Uploading...');
      // Direct update of messages.json
      await uploadTextMessage(
        token,
        roomDetails.messagesFileId,
        userProfile,
        textToSend
      );

      // Force immediate poll to fetch and sync the completed message
      await triggerImmediateSync();
      setConnectionState('Connected');
    } catch (err) {
      console.error(err);
      // Mark optimistic message as failed
      setMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, sending: false, failed: true } : m))
      );
      setConnectionState('Offline cache mode');
    } finally {
      setIsSending(false);
    }
  };

  const triggerImmediateSync = async () => {
    try {
      const metadata = await fetchFileMetadata(token, roomDetails.messagesFileId);
      const downloaded = await downloadMessages(token, roomDetails.messagesFileId);
      const merged = mergeMessages(messages, downloaded);
      await cacheMessages(roomDetails.roomFolderId, merged);
      
      lastModifiedTime.current = metadata.modifiedTime;
      setMessages(merged);
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (e) {
      console.error('[Sync] Immediate sync failed:', e);
    }
  };

  // 6. Staged File Upload Processing (Parallel uploads with image compression)
  const processUploadQueue = async (newQueueItems) => {
    // Process items in parallel
    const uploadPromises = newQueueItems.map(async (item) => {
      // Set to uploading status
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q))
      );

      try {
        setConnectionState('Uploading...');

        let fileToUpload = item.file;
        if (item.file.type.startsWith('image/')) {
          console.log(`[High Speed Upload] Compressing image: ${item.file.name}...`);
          try {
            fileToUpload = await compressImage(item.file);
            console.log(`[High Speed Upload] Image compressed: ${(item.file.size / 1024).toFixed(1)}KB to ${(fileToUpload.size / 1024).toFixed(1)}KB`);
          } catch (compressErr) {
            console.warn('Image compression failed, uploading raw image:', compressErr);
          }
        }

        let mediaType = 'file';
        if (fileToUpload.type.startsWith('image/')) mediaType = 'image';
        if (fileToUpload.type.startsWith('video/')) mediaType = 'video';

        let targetFolderId = roomDetails.folderIds.files;
        if (mediaType === 'image') targetFolderId = roomDetails.folderIds.images;
        if (mediaType === 'video') targetFolderId = roomDetails.folderIds.videos;

        // Perform parallel XHR upload with progress events
        const uploadResult = await uploadBinaryFile(
          token,
          targetFolderId,
          fileToUpload,
          (percent) => {
            setUploadQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q))
            );
          }
        );

        // Upload media JSON referencing the file directly inside messages.json
        await uploadMediaMessage(
          token,
          roomDetails.messagesFileId,
          userProfile,
          mediaType,
          uploadResult.fileId,
          fileToUpload.name
        );

        // Mark complete
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'done', progress: 100 } : q))
        );

        // Auto remove from queue after 2.5 seconds
        setTimeout(() => {
          setUploadQueue((prev) => prev.filter((q) => q.id !== item.id));
        }, 2500);

      } catch (err) {
        console.error(err);
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'failed' } : q))
        );
        setConnectionState('Offline cache mode');
      }
    });

    await Promise.all(uploadPromises);
    await triggerImmediateSync();
    setConnectionState('Connected');
  };

  const handleFilesAdded = (filesList) => {
    const newItems = Array.from(filesList).map((file) => ({
      id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      file,
      progress: 0,
      status: 'waiting',
    }));

    setUploadQueue((prev) => [...prev, ...newItems]);
    processUploadQueue(newItems);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length > 0) {
      handleFilesAdded(e.target.files);
    }
  };

  // Drag & Drop Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  // Clipboard Paste Handler (Screenshot uploads)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          files.push(items[i].getAsFile());
        }
      }
      if (files.length > 0) {
        handleFilesAdded(files);
      }
    }
  };

  // Double click reply quote trigger
  const handleReplyTrigger = (messageToReply) => {
    setReplyTarget({
      id: messageToReply.id,
      senderName: messageToReply.sender.name,
      text: messageToReply.type === 'text' ? messageToReply.text : `[Attachment - ${messageToReply.type}]`,
    });
  };

  const handleForwardTrigger = (messageToForward) => {
    // Basic Forward structure: sets quote and adds forward instruction in input
    setInputText(`[Forwarded: ${messageToForward.text || 'Media attachment'}] `);
    handleReplyTrigger(messageToForward);
  };

  const handleCacheMedia = (fileId, blobUrl) => {
    setMediaCache((prev) => ({
      ...prev,
      [fileId]: blobUrl,
    }));
  };

  // 7. Message visual grouping logic (Successive sender checks within 3 minutes)
  const getGroupedMessages = () => {
    const grouped = [];
    messages.forEach((msg, idx) => {
      let isGrouped = false;
      if (idx > 0) {
        const prevMsg = messages[idx - 1];
        const timeDiff = Math.abs(msg.timestamp - prevMsg.timestamp);
        // Same sender and within 3 minutes (180,000 ms)
        if (
          msg.sender.email === prevMsg.sender.email &&
          timeDiff < 180000 &&
          !msg.replyTo &&
          !prevMsg.replyTo
        ) {
          isGrouped = true;
        }
      }
      grouped.push({
        ...msg,
        isGrouped,
      });
    });
    return grouped;
  };

  const groupedMessagesList = getGroupedMessages();

  // 8. Local search filters
  const filteredMessages = groupedMessagesList.filter((m) => {
    if (!searchQuery) return true;
    return m.text?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div
      className="chat-room-layout"
      onDragEnter={handleDrag}
      onPaste={handlePaste}
    >
      {/* Drag & Drop overlay panel */}
      {dragActive && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1000, background: 'rgba(15, 10, 30, 0.85)' }}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <div style={{ pointerEvents: 'none', textAlign: 'center', border: '2px dashed var(--primary-neon)', borderRadius: '24px', padding: '60px' }}>
            <span style={{ fontSize: '3.5rem' }}>📥</span>
            <h2 className="modal-header" style={{ marginTop: '15px' }}>Drop Files to Upload</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Release your files to upload them instantly in parallel.</p>
          </div>
        </div>
      )}

      <Sidebar
        roomDetails={roomDetails}
        messages={messages}
        userProfile={userProfile}
        onExitRoom={onExitRoom}
        isOpenMobile={isMobileSidebarOpen}
        onlineParticipants={onlineParticipants}
      />

      <div className="chat-pane" onClick={() => setIsMobileSidebarOpen(false)}>
        {/* Chat Header Pane */}
        <header className="chat-pane-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', overflow: 'hidden' }}>
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
            <div className="chat-header-info" style={{ overflow: 'hidden' }}>
              <h3 className="chat-header-title" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {roomDetails.roomName}
              </h3>
              <div className="sync-status">
                <span className={`sync-dot ${connectionState.toLowerCase().replace(/\s/g, '-')}`}></span>
                {connectionState}
              </div>
            </div>
          </div>

          {/* Quick Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '180px' }}>
            <input
              type="text"
              placeholder="Search chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="chat-text-input"
              style={{ height: '34px', fontSize: '0.8rem', padding: '0 10px', background: 'rgba(0,0,0,0.2)' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ×
              </button>
            )}
          </div>
        </header>

        {/* Message Scroller Viewport */}
        <div className="messages-scroller" ref={scrollerRef}>
          {filteredMessages.length > 0 ? (
            filteredMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                token={token}
                isSent={msg.sender.email === userProfile.email}
                mediaCache={mediaCache}
                onCacheMedia={handleCacheMedia}
                isGrouped={msg.isGrouped}
                onReplyTrigger={handleReplyTrigger}
                onForwardTrigger={handleForwardTrigger}
              />
            ))
          ) : (
            <div className="no-messages-prompt">
              <div className="no-messages-icon">{searchQuery ? '🔍' : '💬'}</div>
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: '6px' }}>
                {searchQuery ? 'No results found' : 'Empty Chat Room'}
              </h4>
              <p>
                {searchQuery
                  ? 'No messages matched your query.'
                  : 'Send a secure text, drag & drop files, or paste screenshots to start chatting!'}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Active Typing indicators */}
        {typingUsers.length > 0 && (
          <div style={{
            padding: '4px 24px',
            fontSize: '0.8rem',
            color: 'var(--primary-neon-bright)',
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <span className="media-spinner" style={{ width: '10px', height: '10px', borderWidth: '1px' }}></span>
            {typingUsers.map(u => u.name).join(', ')} {typingUsers.length > 1 ? 'are typing...' : 'is typing...'}
          </div>
        )}

        {/* Fixed Input Form */}
        <footer className="chat-input-area">
          
          {/* Parallel Uploads Progress Drawer */}
          {uploadQueue.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Uploading Attachments ({uploadQueue.length})</div>
              {uploadQueue.map((item) => (
                <UploadPreview
                  key={item.id}
                  file={item.file}
                  progress={item.progress}
                  onCancel={() => {
                    setUploadQueue(prev => prev.filter(q => q.id !== item.id));
                  }}
                />
              ))}
            </div>
          )}

          {/* Staged Reply Quote Drawer */}
          {replyTarget && (
            <div className="upload-preview-container" style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '8px 15px' }}>
              <div className="preview-thumbnail" style={{ fontSize: '1rem' }}>↶</div>
              <div className="preview-details">
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-neon-bright)' }}>Replying to {replyTarget.senderName}</div>
                <div className="preview-filename" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{replyTarget.text}</div>
              </div>
              <button className="btn-remove-preview" onClick={() => setReplyTarget(null)}>×</button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="input-row">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="file-input-hidden"
              multiple // Allows selecting multiple files at once!
            />

            <button
              type="button"
              className="btn-attachment"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              title="Upload Attachments"
            >
              📎
            </button>

            <input
              type="text"
              className="chat-text-input"
              placeholder={replyTarget ? `Type reply to ${replyTarget.senderName}...` : 'Type secure message... (Paste image supported)'}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                handleTyping();
              }}
              disabled={isSending}
            />

            <button
              type="submit"
              className="btn-send"
              disabled={isSending || !inputText.trim()}
              title="Send Message"
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
