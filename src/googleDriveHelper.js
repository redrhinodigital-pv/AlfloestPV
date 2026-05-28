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
 * Create a new Room with subfolders and room_meta.json
 */
export async function createRoom(token, roomName, creatorProfile) {
  // 1. Get/Create root folder AlfloestPV
  const rootId = await getOrCreateFolder('AlfloestPV', null, token);

  // 2. Get/Create rooms/ folder inside root
  const roomsDirId = await getOrCreateFolder('rooms', rootId, token);

  // 3. Generate a beautiful random Room Code (e.g. PV-9X82KQ)
  const roomCode = `PV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // 4. Create the room's folder
  const roomFolderId = await getOrCreateFolder(roomCode, roomsDirId, token);

  // 5. Create subfolders: messages, images, videos, files
  const messagesFolderId = await getOrCreateFolder('messages', roomFolderId, token);
  const imagesFolderId = await getOrCreateFolder('images', roomFolderId, token);
  const videosFolderId = await getOrCreateFolder('videos', roomFolderId, token);
  const filesFolderId = await getOrCreateFolder('files', roomFolderId, token);

  // 6. Create room_meta.json
  const metadata = {
    roomId: roomCode,
    roomName: roomName || `${creatorProfile.name}'s Room`,
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

  // Upload room_meta.json inside the room's folder
  const metaFileId = await writeJsonFile(token, roomFolderId, 'room_meta.json', metadata);

  // 7. Make room folder accessible: Anyone with the link can edit
  await setPublicPermissions(token, roomFolderId);

  // 8. Generate a custom Room ID that contains the Folder ID base64-encoded to make joining direct and bulletproof
  const packedId = `PV-${btoa(roomFolderId).replace(/=/g, '')}`;

  return {
    roomCode,
    packedId,
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
 * Resolves a shareable code, url, or direct folderId into room metadata
 */
export async function joinRoom(token, inputRoomId) {
  let folderId = '';

  // Clean the input
  const cleanInput = inputRoomId.trim();

  // Case 1: Pasted an invite URL
  if (cleanInput.includes('http://') || cleanInput.includes('https://') || cleanInput.includes('?room=')) {
    try {
      const url = new URL(cleanInput);
      const roomParam = url.searchParams.get('room');
      if (roomParam) {
        folderId = roomParam;
      }
    } catch (_) {}
  }

  // Case 2: Pasted a packed Base64 code starting with PV-
  if (!folderId && cleanInput.startsWith('PV-') && cleanInput.length > 15) {
    try {
      const base64Str = cleanInput.substring(3);
      // Base64 padding if stripped
      const padded = base64Str.padEnd(base64Str.length + (4 - (base64Str.length % 4)) % 4, '=');
      folderId = atob(padded);
    } catch (_) {}
  }

  // Case 3: Direct folder ID or short random code (search fallback)
  if (!folderId) {
    if (cleanInput.length > 20) {
      // Looks like a direct Google Drive folder ID
      folderId = cleanInput;
    } else {
      // Short code fallback search: find folder named like the code
      const query = `name = '${cleanInput}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`;
      const searchRes = await driveFetch(searchUrl, token);
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
      } else {
        throw new Error(`Room folder for "${cleanInput}" could not be found. Ask the host for the full Share Link.`);
      }
    }
  }

  // Fetch the room_meta.json inside this folder ID
  const metaQuery = `'${folderId}' in parents and name = 'room_meta.json' and trashed = false`;
  const metaUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(metaQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`;
  const metaRes = await driveFetch(metaUrl, token);
  const metaData = await metaRes.json();

  if (!metaData.files || metaData.files.length === 0) {
    throw new Error('Room found, but room_meta.json is missing or inaccessible.');
  }

  const metaFileId = metaData.files[0].id;

  // Download metadata content
  const downloadUrl = `${DRIVE_API_BASE}/files/${metaFileId}?alt=media`;
  const contentRes = await driveFetch(downloadUrl, token);
  const roomMeta = await contentRes.json();

  // Return formatted metadata
  return {
    roomCode: roomMeta.roomId,
    packedId: `PV-${btoa(folderId).replace(/=/g, '')}`,
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
 * List message files inside the messages folder and return parsed messages
 */
export async function listMessages(token, messagesFolderId, existingMessageIds = new Set()) {
  const query = `'${messagesFolderId}' in parents and trashed = false`;
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
