/**
 * googleDriveHelper.js
 * 
 * A 100% client-side serverless helper using direct REST API requests to Google Drive
 * and Google Identity Services (GIS) for authentication.
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const USERINFO_API = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Global reference for GIS token client
let tokenClient = null;

/**
 * Initialize Google Identity Services OAuth Client
 * @param {string} clientId - The developer Google Client ID
 * @param {function} onTokenReceived - Callback when token is obtained
 * @param {function} onError - Callback on failure
 */
export function initGoogleAuth(clientId, onTokenReceived, onError) {
  if (typeof window.google === 'undefined') {
    onError(new Error('Google Identity Services script not loaded yet.'));
    return;
  }

  try {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: (response) => {
        if (response.error) {
          onError(response);
        } else if (response.access_token) {
          // Store token and calculate expiration
          const expiresAt = Date.now() + (response.expires_in * 1000);
          onTokenReceived({
            accessToken: response.access_token,
            expiresAt,
          });
        }
      },
    });
  } catch (err) {
    onError(err);
  }
}

/**
 * Trigger the Google OAuth Login Flow popup
 */
export function loginWithGoogle() {
  if (!tokenClient) {
    throw new Error('Google Auth not initialized. Call initGoogleAuth first.');
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Trigger the silent background Google OAuth login flow (no popups)
 */
export function loginSilentlyWithGoogle() {
  if (!tokenClient) {
    throw new Error('Google Auth not initialized. Call initGoogleAuth first.');
  }
  tokenClient.requestAccessToken({ prompt: '' });
}

/**
 * Fetch the authenticated user's profile details
 * @param {string} token - Google OAuth Access Token
 */
export async function getUserProfile(token) {
  const res = await fetch(USERINFO_API, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.statusText}`);
  }
  const data = await res.json();
  return {
    name: data.name,
    email: data.email,
    picture: data.picture,
  };
}

/**
 * Generic API helper to reduce repetitive code
 */
async function driveFetch(url, token, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errMsg = `Drive API Error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) {
        errMsg = errorJson.error.message;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }
  return response;
}

/**
 * Creates or retrieves a folder in Google Drive
 */
async function getOrCreateFolder(name, parentId, token) {
  let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const listRes = await driveFetch(listUrl, token);
  const listData = await listRes.json();

  if (listData.files && listData.files.length > 0) {
    return listData.files[0].id;
  }

  // Create folder
  const createUrl = `${DRIVE_API_BASE}/files`;
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const createRes = await driveFetch(createUrl, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  return createData.id;
}

/**
 * Creates a folder directly in Google Drive, bypassing getOrCreate checks
 */
async function createFolderDirectly(name, parentId, token) {
  const createUrl = `${DRIVE_API_BASE}/files`;
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const createRes = await driveFetch(createUrl, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  return createData.id;
}

/**
 * Create a new Room with subfolders and room_meta.json
 */
export async function createRoom(token, roomName, creatorProfile) {
  console.log('[Room Creation] Initiating root folder setup...');
  // 1. Get/Create root folder AlfloestPV
  const rootId = await getOrCreateFolder('AlfloestPV', null, token);

  // 2. Get/Create rooms/ folder inside root
  const roomsDirId = await getOrCreateFolder('rooms', rootId, token);

  const cleanRoomName = roomName || `${creatorProfile.name}'s Room`;
  console.log(`[Room Creation] Creating room folder directly: ${cleanRoomName}`);
  
  // 3. Create the room's folder directly to guarantee a unique folder ID
  const roomFolderId = await createFolderDirectly(cleanRoomName, roomsDirId, token);

  // CRITICAL REQUIREMENT 1: Share the room folder IMMEDIATELY before creating subfolders/files
  console.log('[Room Creation] Applying public sharing to room folder immediately...');
  try {
    await setPublicPermissions(token, roomFolderId);
  } catch (err) {
    console.error('[Room Creation] Failed to set public permissions on room folder:', err);
    throw new Error(`Failed to set public permissions on room folder: ${err.message}`);
  }

  // 4. Create subfolders and CRITICAL REQUIREMENT 2: Explicitly share each subfolder individually
  console.log('[Room Creation] Initializing and sharing subfolders...');
  
  const messagesFolderId = await createFolderDirectly('messages', roomFolderId, token);
  await setPublicPermissions(token, messagesFolderId).catch(e => console.warn('Subfolder share delayed:', e));

  const imagesFolderId = await createFolderDirectly('images', roomFolderId, token);
  await setPublicPermissions(token, imagesFolderId).catch(e => console.warn('Subfolder share delayed:', e));

  const videosFolderId = await createFolderDirectly('videos', roomFolderId, token);
  await setPublicPermissions(token, videosFolderId).catch(e => console.warn('Subfolder share delayed:', e));

  const filesFolderId = await createFolderDirectly('files', roomFolderId, token);
  await setPublicPermissions(token, filesFolderId).catch(e => console.warn('Subfolder share delayed:', e));

  // 5. Create room_meta.json structure
  const metadata = {
    roomId: roomFolderId, // Use raw folder ID as room ID strictly!
    roomCode: roomFolderId, // Omit packed code, use raw folder ID for displays
    roomName: cleanRoomName,
    creator: {
      name: creatorProfile.name,
      email: creatorProfile.email,
      picture: creatorProfile.picture,
    },
    createdAt: Date.now(),
    folderIds: {
      messages: messagesFolderId,
      images: imagesFolderId,
      videos: videosFolderId,
      files: filesFolderId,
    },
  };

  console.log('[Room Creation] Creating and sharing room_meta.json...');
  // Upload room_meta.json inside the room's folder
  const metaFileId = await writeJsonFile(token, roomFolderId, 'room_meta.json', metadata);
  // Explicitly apply public permission to metadata file
  await setPublicPermissions(token, metaFileId).catch(e => console.warn('Metadata share delayed:', e));

  // CRITICAL REQUIREMENT 3: Do not finalize room creation until room_meta.json exists, permissions are verified, and test fetch passes
  console.log('[Room Creation] Final verification loop started. Verifying metadata accessibility & permissions...');
  let isVerified = false;
  
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      // Test 1: Verify file exists and is accessible
      const verifyUrl = `${DRIVE_API_BASE}/files/${metaFileId}`;
      const res = await driveFetch(verifyUrl, token);
      
      if (res.ok) {
        // Test 2: Programmatically verify public permissions are active (type: anyone, role: writer)
        const folderPermUrl = `${DRIVE_API_BASE}/files/${roomFolderId}/permissions?fields=permissions(type,role)`;
        const folderPermRes = await driveFetch(folderPermUrl, token);
        const folderPerms = await folderPermRes.json();
        const folderShared = folderPerms.permissions?.some(p => p.type === 'anyone' && p.role === 'writer');

        const metaPermUrl = `${DRIVE_API_BASE}/files/${metaFileId}/permissions?fields=permissions(type,role)`;
        const metaPermRes = await driveFetch(metaPermUrl, token);
        const metaPerms = await metaPermRes.json();
        const metaShared = metaPerms.permissions?.some(p => p.type === 'anyone' && p.role === 'writer');

        // Test 3: Simulate guest metadata fetch and verify fields
        const downloadUrl = `${DRIVE_API_BASE}/files/${metaFileId}?alt=media`;
        const downloadRes = await driveFetch(downloadUrl, token);
        const testMeta = await downloadRes.json();
        const contentValid = testMeta.roomId === roomFolderId && testMeta.folderIds?.messages;

        if (folderShared && metaShared && contentValid) {
          isVerified = true;
          console.log(`[Room Creation] room_meta.json, permissions, and guest-fetch simulation successfully verified on attempt ${attempt}.`);
          break;
        } else {
          console.warn(`[Room Creation] Attempt ${attempt} succeeded file check but validation is still propagating: FolderShared=${folderShared}, MetaShared=${metaShared}, ContentValid=${contentValid}`);
        }
      }
    } catch (err) {
      console.warn(`[Room Creation] Verification attempt ${attempt} failed: ${err.message}. Retrying in 1000ms...`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!isVerified) {
    throw new Error('Verification failed: public permissions or metadata could not be fully verified on Google Drive.');
  }

  console.log(`[Room Creation] Room folder ${roomFolderId} successfully finalized and verified!`);
  return {
    roomCode: roomFolderId,
    packedId: roomFolderId, // ONLY use raw folder ID (no packed base64)
    roomName: metadata.roomName,
    folderId: roomFolderId,
    folderIds: metadata.folderIds,
  };
}

/**
 * Set public permissions on a Google Drive file or folder so anyone with the link can write to it
 */
async function setPublicPermissions(token, fileId) {
  const url = `${DRIVE_API_BASE}/files/${fileId}/permissions`;
  const body = {
    role: 'writer',
    type: 'anyone',
    allowFileDiscovery: false,
  };

  await driveFetch(url, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Helper to write a JSON file to a directory
 */
async function writeJsonFile(token, parentFolderId, filename, data) {
  // Step 1: Create metadata
  const metaUrl = `${DRIVE_API_BASE}/files`;
  const metaBody = {
    name: filename,
    parents: [parentFolderId],
    mimeType: 'application/json',
  };

  const metaRes = await driveFetch(metaUrl, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metaBody),
  });
  const fileInfo = await metaRes.json();

  // Step 2: Upload raw JSON content
  const contentUrl = `${DRIVE_UPLOAD_BASE}/files/${fileInfo.id}?uploadType=media`;
  await driveFetch(contentUrl, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return fileInfo.id;
}

/**
 * Resolves a shareable code, url, or direct folderId into room metadata.
 * CRITICAL REQUIREMENT: Direct fetch with 10 silent auto-retries and 1s delays.
 */
export async function joinRoom(token, inputRoomId, onAttempt) {
  let folderId = '';

  const cleanInput = inputRoomId.trim();

  // Case 1: Pasted an invite URL or contains '?room=' (extract raw folder ID)
  if (cleanInput.includes('http://') || cleanInput.includes('https://') || cleanInput.includes('?room=')) {
    try {
      let urlStr = cleanInput;
      if (cleanInput.startsWith('?room=')) {
        urlStr = `https://alfloest-pv.vercel.app/${cleanInput}`;
      } else if (!cleanInput.startsWith('http://') && !cleanInput.startsWith('https://')) {
        urlStr = `https://${cleanInput}`;
      }
      const url = new URL(urlStr);
      const roomParam = url.searchParams.get('room');
      if (roomParam) {
        folderId = roomParam;
      }
    } catch (err) {
      console.warn('[Join Room] Failed to parse invite URL:', err);
    }
  }

  // Case 2: Direct raw Google Drive folder ID
  if (!folderId) {
    folderId = cleanInput;
  }

  console.log(`[Join Room] Initiating metadata lookup for folder ID: ${folderId}`);
  let metaData = null;
  let metaFileId = '';

  // Silent retry loop (up to 10 attempts, 1-second delay between attempts)
  for (let attempt = 1; attempt <= 10; attempt++) {
    if (onAttempt) {
      try {
        onAttempt(attempt);
      } catch (e) {}
    }

    try {
      const metaQuery = `'${folderId}' in parents and name = 'room_meta.json' and trashed = false`;
      const metaUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(metaQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`;
      const metaRes = await driveFetch(metaUrl, token);
      metaData = await metaRes.json();
      
      if (metaData.files && metaData.files.length > 0) {
        metaFileId = metaData.files[0].id;
        console.log(`[Join Room] room_meta.json resolved on attempt ${attempt}.`);
        break;
      }
    } catch (err) {
      console.warn(`[Join Room] Attempt ${attempt} failed to find metadata:`, err);
    }
    
    if (attempt < 10) {
      console.log(`[Join Room] room_meta.json not resolved on attempt ${attempt}. Retrying in 1000ms...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!metaFileId) {
    throw new Error('Room metadata could not be fetched or verified from cloud nodes. The host might be offline or still syncing.');
  }

  // Download metadata content
  const downloadUrl = `${DRIVE_API_BASE}/files/${metaFileId}?alt=media`;
  const contentRes = await driveFetch(downloadUrl, token);
  const roomMeta = await contentRes.json();

  // Return formatted metadata
  return {
    roomCode: folderId, // STRICT: Only raw folder ID
    packedId: folderId, // STRICT: Only raw folder ID
    roomName: roomMeta.roomName,
    folderId,
    folderIds: roomMeta.folderIds,
    creator: roomMeta.creator,
  };
}

/**
 * Upload a text message JSON
 */
export async function uploadTextMessage(token, messagesFolderId, sender, text) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 7);
  const filename = `${timestamp}_${randomStr}.json`;

  const messagePayload = {
    id: `msg_${timestamp}_${randomStr}`,
    sender: {
      name: sender.name,
      email: sender.email,
      picture: sender.picture,
    },
    type: 'text',
    text,
    timestamp,
  };

  return await writeJsonFile(token, messagesFolderId, filename, messagePayload);
}

/**
 * Upload a binary file (image/video/general file) with upload progress
 */
export function uploadBinaryFile(token, folderId, file, onProgress) {
  return new Promise((resolve, reject) => {
    // Step 1: Create metadata record
    const metaUrl = `${DRIVE_API_BASE}/files`;
    const metaBody = {
      name: file.name,
      parents: [folderId],
      mimeType: file.type,
    };

    fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaBody),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to create file metadata in Drive.');
        return res.json();
      })
      .then((fileInfo) => {
        // Step 2: Upload raw binary content using XMLHttpRequest to support progress tracking
        const uploadUrl = `${DRIVE_UPLOAD_BASE}/files/${fileInfo.id}?uploadType=media`;
        const xhr = new XMLHttpRequest();

        xhr.open('PATCH', uploadUrl, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        // Track upload progress
        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              onProgress(percentComplete);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              fileId: fileInfo.id,
              fileName: file.name,
              mimeType: file.type,
              size: file.size,
            });
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status} ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during file upload.'));
        };

        xhr.send(file);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 * Upload a media message JSON linking to the uploaded binary file
 */
export async function uploadMediaMessage(token, messagesFolderId, sender, mediaType, fileId, fileName) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 7);
  const filename = `${timestamp}_${randomStr}.json`;

  const messagePayload = {
    id: `msg_${timestamp}_${randomStr}`,
    sender: {
      name: sender.name,
      email: sender.email,
      picture: sender.picture,
    },
    type: mediaType, // 'image', 'video', or 'file'
    fileId,
    text: fileName, // Fallback display name
    timestamp,
  };

  return await writeJsonFile(token, messagesFolderId, filename, messagePayload);
}


/**
 * List message files inside the messages folder and return parsed messages.
 * Includes optional lastMessageName to execute lexicographical delta syncing.
 */
export async function listMessages(token, messagesFolderId, existingMessageIds = new Set(), lastMessageName = null) {
  let query = `'${messagesFolderId}' in parents and trashed = false`;
  if (lastMessageName) {
    query += ` and name > '${lastMessageName}'`;
  }
  // Order by name so they sort naturally by the prefix timestamp
  const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&orderBy=name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
  
  const listRes = await driveFetch(listUrl, token);
  const listData = await listRes.json();

  if (!listData.files || listData.files.length === 0) {
    return [];
  }

  const messages = [];

  // Filter out already fetched messages to save API calls
  const newFiles = listData.files.filter(f => !existingMessageIds.has(f.id));

  // Batch download new JSONs concurrently
  const fetchPromises = newFiles.map(async (file) => {
    try {
      const downloadUrl = `${DRIVE_API_BASE}/files/${file.id}?alt=media`;
      const res = await driveFetch(downloadUrl, token);
      const msg = await res.json();
      // Inject the Google Drive File ID representing this message JSON
      msg.gdriveFileId = file.id;
      msg.gdriveFileName = file.name;
      return msg;
    } catch (err) {
      console.error(`Error downloading message file ${file.name}:`, err);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach((msg) => {
    if (msg) messages.push(msg);
  });

  // Sort by timestamp just in case
  messages.sort((a, b) => a.timestamp - b.timestamp);

  return messages;
}

/**
 * Download a binary file as a Blob and create a temporary object URL
 */
export async function downloadFileAsBlobUrl(token, fileId) {
  const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
  const res = await driveFetch(url, token);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Update (create or rename) the user's online or typing status file inside the room folder.
 * Uses file renaming (metadata update) for 0-byte instantaneous signaling.
 */
export async function updatePresenceStatus(token, roomFolderId, email, name, statusType, currentFileId) {
  const cleanEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanName = encodeURIComponent(name.replace(/_/g, ' '));
  const newName = `status_${statusType}_${cleanEmail}_${cleanName}_${Date.now()}.json`;

  if (currentFileId) {
    // Overwrite/Update filename of existing file by ID
    const url = `${DRIVE_API_BASE}/files/${currentFileId}`;
    try {
      const res = await driveFetch(url, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      return data.id;
    } catch (err) {
      console.error(`Failed to rename status file ${currentFileId}:`, err);
      // Fallback: create a new one
    }
  }

  // Find if a file for this user and statusType already exists in this folder
  const query = `'${roomFolderId}' in parents and name contains 'status_${statusType}_${cleanEmail}_' and trashed = false`;
  const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const listRes = await driveFetch(listUrl, token);
  const listData = await listRes.json();

  if (listData.files && listData.files.length > 0) {
    const existingId = listData.files[0].id;
    // Rename existing
    const patchUrl = `${DRIVE_API_BASE}/files/${existingId}`;
    const patchRes = await driveFetch(patchUrl, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const patchData = await patchRes.json();
    return patchData.id;
  }

  // Create a new 0-byte file
  const createUrl = `${DRIVE_API_BASE}/files`;
  const createBody = {
    name: newName,
    parents: [roomFolderId],
    mimeType: 'application/json',
  };

  const createRes = await driveFetch(createUrl, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const createData = await createRes.json();
  return createData.id;
}

/**
 * List all live status files inside the room folder and parse online/typing user details.
 */
export async function listLiveStatuses(token, roomFolderId) {
  const query = `'${roomFolderId}' in parents and name contains 'status_' and trashed = false`;
  const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
  
  try {
    const listRes = await driveFetch(listUrl, token);
    const listData = await listRes.json();

    const onlineUsers = [];
    const typingUsers = [];
    const now = Date.now();

    if (listData.files) {
      listData.files.forEach((file) => {
        // Format: status_[statusType]_[cleanEmail]_[cleanName]_[timestamp].json
        const parts = file.name.split('_');
        if (parts.length >= 5 && parts[0] === 'status') {
          const type = parts[1]; // 'online' or 'typing'
          const cleanEmail = parts[2];
          const cleanName = decodeURIComponent(parts[3]);
          const timestampStr = parts[4].split('.')[0];
          const timestamp = Number(timestampStr);

          const user = {
            email: cleanEmail,
            name: cleanName,
            timestamp,
          };

          if (type === 'online' && now - timestamp < 20000) {
            // Online inside 20 seconds
            onlineUsers.push(user);
          } else if (type === 'typing' && now - timestamp < 7000) {
            // Typing inside 7 seconds
            typingUsers.push(user);
          }
        }
      });
    }

    return { onlineUsers, typingUsers };
  } catch (err) {
    console.error('Error fetching live presence statuses:', err);
    return { onlineUsers: [], typingUsers: [] };
  }
}
