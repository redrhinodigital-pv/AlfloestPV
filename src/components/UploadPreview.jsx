import React from 'react';

export default function UploadPreview({ file, progress, onCancel }) {
  if (!file) return null;

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getPreviewSrc = () => {
    if (isImage) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  return (
    <div className="upload-preview-container">
      <div className="preview-thumbnail">
        {isImage ? (
          <img
            src={getPreviewSrc()}
            alt="staged attachment"
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
          />
        ) : isVideo ? (
          '📹'
        ) : (
          '📄'
        )}
      </div>

      <div className="preview-details">
        <div className="preview-filename" title={file.name}>
          {file.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {formatSize(file.size)} • {file.type || 'Unknown Type'}
        </div>

        {progress !== null && (
          <div className="upload-progress-wrapper">
            <div className="upload-progress-bar">
              <div
                className="upload-progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="upload-percentage">{progress}%</span>
          </div>
        )}
      </div>

      <button className="btn-remove-preview" onClick={onCancel} title="Cancel upload">
        ×
      </button>
    </div>
  );
}
