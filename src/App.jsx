import React, { useState, useEffect } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import CreateRoomModal from './components/CreateRoomModal';
import JoinRoomModal from './components/JoinRoomModal';
import ChatRoom from './components/ChatRoom';
import {
  getUserProfile,
  createRoom,
  joinRoom,
  initGoogleAuth,
  loginSilentlyWithGoogle,
  loginWithGoogle,
} from './googleDriveHelper';

// ONE hardcoded global CLIENT_ID for the entire application
const CLIENT_ID = '953186837803-qfbe987178lhvmo3d23rm8t7tvd652m8.apps.googleusercontent.com';

export default function App() {
  const [authState, setAuthState] = useState(() => {
    // Try to load cached token if still valid
    const cachedToken = localStorage.getItem('alfloest_token');
    const cachedExpires = localStorage.getItem('alfloest_token_expires');

    if (cachedToken && cachedExpires) {
      if (Date.now() < Number(cachedExpires)) {
        return {
          accessToken: cachedToken,
          expiresAt: Number(cachedExpires),
        };
      }
    }
    return null;
  });

  const [userProfile, setUserProfile] = useState(() => {
    const cachedProfile = localStorage.getItem('alfloest_profile');
    return cachedProfile ? JSON.parse(cachedProfile) : null;
  });

  const [activeRoom, setActiveRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(null);
  const [globalError, setGlobalError] = useState(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  // Global GIS Initialization and Silent Auto-Login
  useEffect(() => {
    let active = true;

    const checkAndInit = () => {
      if (!active) return;

      if (window.google?.accounts?.oauth2) {
        initGoogleAuth(
          CLIENT_ID,
          (authData) => {
            if (!active) return;
            handleLoginSuccess(authData);
          },
          (err) => {
            if (!active) return;
            console.error('GIS Error:', err);
            setIsLoading(false);
            // If silent login fails, clear logged in flag
            localStorage.removeItem('alfloest_logged_in');
          }
        );

        // If logged in flag is true, trigger silent auto-login!
        if (localStorage.getItem('alfloest_logged_in') === 'true' && !authState?.accessToken) {
          setIsLoading(true);
          try {
            setTimeout(() => {
              if (active) loginSilentlyWithGoogle();
            }, 100);
          } catch (e) {
            console.error('Silent auto-auth execution failed:', e);
            setIsLoading(false);
            localStorage.removeItem('alfloest_logged_in');
          }
        }
      } else {
        // Retry in 100ms
        setTimeout(checkAndInit, 100);
      }
    };

    checkAndInit();

    return () => {
      active = false;
    };
  }, []);

  // Load profile when authState changes
  useEffect(() => {
    if (authState?.accessToken && !userProfile) {
      setIsLoading(true);
      setGlobalError(null);
      getUserProfile(authState.accessToken)
        .then((profile) => {
          setUserProfile(profile);
          localStorage.setItem('alfloest_profile', JSON.stringify(profile));
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setGlobalError('Failed to fetch Google profile. Session may have expired.');
          handleLogout();
          setIsLoading(false);
        });
    }
  }, [authState, userProfile]);

  // Deep-linking / URL Invite Joiner Effect
  useEffect(() => {
    // If authenticated and has a ?room= URL parameter, join the room immediately!
    if (authState?.accessToken && userProfile) {
      const params = new URLSearchParams(window.location.search);
      const urlRoomId = params.get('room');
      if (urlRoomId && !activeRoom) {
        setIsLoading(true);
        setLoadingStatus('Connecting to secure room... Syncing with cloud nodes (Attempt 1/10)...');
        joinRoom(authState.accessToken, urlRoomId, (attempt) => {
          setLoadingStatus(`Connecting to secure room... Syncing with cloud nodes (Attempt ${attempt}/10)...`);
        })
          .then((roomData) => {
            handleJoinSuccess(roomData);
            // Clear URL param to keep address bar clean
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => {
            console.error('URL Autojoin failed:', err);
            setGlobalError(`Autojoin invite link failed: ${err.message}`);
          })
          .finally(() => {
            setIsLoading(false);
            setLoadingStatus(null);
          });
      }
    }
  }, [authState, userProfile, activeRoom]);

  const handleLoginClick = () => {
    setIsLoading(true);
    setGlobalError(null);
    try {
      loginWithGoogle();
    } catch (err) {
      setIsLoading(false);
      setGlobalError(err.message || 'Auth flow failed to launch. Ensure Google script is loaded.');
    }
  };

  const handleLoginSuccess = (authData) => {
    setAuthState(authData);
    localStorage.setItem('alfloest_token', authData.accessToken);
    localStorage.setItem('alfloest_token_expires', authData.expiresAt.toString());
    localStorage.setItem('alfloest_logged_in', 'true');
    setIsLoading(false);
  };

  const handleLogout = () => {
    setAuthState(null);
    setUserProfile(null);
    setActiveRoom(null);
    localStorage.removeItem('alfloest_token');
    localStorage.removeItem('alfloest_token_expires');
    localStorage.removeItem('alfloest_profile');
    localStorage.removeItem('alfloest_logged_in');
  };

  const handleCreateRoom = async (roomName) => {
    if (!authState?.accessToken || !userProfile) return;

    setIsLoading(true);
    setLoadingStatus('Creating room structures & configuring secure permissions on Google Drive...');
    try {
      const room = await createRoom(authState.accessToken, roomName, userProfile);
      handleJoinSuccess(room, true);
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
      setLoadingStatus(null);
    }
  };

  const handleJoinRoom = async (roomIdInput) => {
    if (!authState?.accessToken) return;

    setIsLoading(true);
    setLoadingStatus('Connecting to secure room... Syncing with cloud nodes (Attempt 1/10)...');
    try {
      const room = await joinRoom(authState.accessToken, roomIdInput, (attempt) => {
        setLoadingStatus(`Connecting to secure room... Syncing with cloud nodes (Attempt ${attempt}/10)...`);
      });
      handleJoinSuccess(room, false);
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
      setLoadingStatus(null);
    }
  };

  const handleJoinSuccess = (roomData, isCreatorInput = false) => {
    setActiveRoom(roomData);

    // Save/Update room in recent history list in localStorage
    const rawHistory = JSON.parse(localStorage.getItem('alfloest_room_history') || '[]');
    
    // Normalize and migrate old format history
    const history = rawHistory.map(item => {
      const mappedId = item.roomFolderId || item.folderId || item.packedId;
      return {
        ...item,
        roomFolderId: mappedId,
        folderId: mappedId,
      };
    });

    // Check if room already in history
    const existingIndex = history.findIndex((r) => r.roomFolderId === roomData.roomFolderId);
    
    const isCreator = existingIndex > -1 ? history[existingIndex].isCreator : isCreatorInput;

    const historyItem = {
      roomFolderId: roomData.roomFolderId,
      roomName: roomData.roomName,
      messagesFileId: roomData.messagesFileId,
      folderIds: roomData.folderIds,
      isCreator,
      lastVisited: Date.now(),
    };

    if (existingIndex > -1) {
      history[existingIndex] = historyItem;
    } else {
      history.push(historyItem);
    }

    localStorage.setItem('alfloest_room_history', JSON.stringify(history));
  };

  const handleRejoinRoom = (historyItem) => {
    setIsLoading(true);
    setGlobalError(null);
    setLoadingStatus('Connecting to secure room... Syncing with cloud nodes (Attempt 1/10)...');
    joinRoom(authState.accessToken, historyItem.roomFolderId, (attempt) => {
      setLoadingStatus(`Connecting to secure room... Syncing with cloud nodes (Attempt ${attempt}/10)...`);
    })
      .then((roomData) => {
        handleJoinSuccess(roomData, historyItem.isCreator);
      })
      .catch((err) => {
        console.error('Rejoin room failed:', err);
        setGlobalError(`Rejoining room failed: ${err.message}. It may have been deleted by the host.`);
        // Remove from history if it is missing
        const rawHistory = JSON.parse(localStorage.getItem('alfloest_room_history') || '[]');
        const filtered = rawHistory.filter((r) => {
          const mappedId = r.roomFolderId || r.folderId || r.packedId;
          return mappedId !== historyItem.roomFolderId;
        });
        localStorage.setItem('alfloest_room_history', JSON.stringify(filtered));
      })
      .finally(() => {
        setIsLoading(false);
        setLoadingStatus(null);
      });
  };

  const handleExitRoom = () => {
    setActiveRoom(null);
    setGlobalError(null);
  };

  return (
    <div className="app-container">
      {/* Decorative Orbs */}
      <div className="blur-orb orb-1"></div>
      <div className="blur-orb orb-2"></div>

      {isLoading && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1000, background: 'rgba(5, 3, 10, 0.85)' }}
        >
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div className="media-spinner" style={{ width: '48px', height: '48px', borderWidth: '3px', marginBottom: '20px' }}></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.01em' }}>
              Alfloest PV Cloud
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '320px', margin: '6px auto 0' }}>
              {loadingStatus || 'Communicating with secure Google Drive nodes...'}
            </div>
          </div>
        </div>
      )}

      {/* Global error banner */}
      {globalError && !isLoading && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            background: 'rgba(239, 68, 68, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>⚠️ {globalError}</span>
          <button
            onClick={() => setGlobalError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* View Coordinator Router */}
      {!authState?.accessToken ? (
        <LoginScreen
          handleLoginClick={handleLoginClick}
          isLoading={isLoading}
          error={globalError}
        />
      ) : activeRoom ? (
        <ChatRoom
          roomDetails={activeRoom}
          userProfile={userProfile}
          token={authState.accessToken}
          onExitRoom={handleExitRoom}
        />
      ) : userProfile ? (
        <Dashboard
          userProfile={userProfile}
          onLogout={handleLogout}
          onCreateRoomClick={() => setIsCreateOpen(true)}
          onJoinRoomClick={() => setIsJoinOpen(true)}
          onRejoinRoom={handleRejoinRoom}
        />
      ) : null}

      {/* Modals Overlay Controllers */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateRoom={handleCreateRoom}
      />

      <JoinRoomModal
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        onJoinRoom={handleJoinRoom}
      />
    </div>
  );
}
