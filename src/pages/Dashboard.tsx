import { useState } from 'react';
import type { StatusResponse } from '../types';

interface Props {
  status: StatusResponse;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRestart: () => Promise<void>;
  loading: boolean;
}

export function Dashboard({ status, onStart, onStop, onRestart, loading }: Props) {
  const [actionLoading, setActionLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Normalize status - backend sends lowercase enum variants
  const vmStatus = typeof status.vm_status === 'string'
    ? status.vm_status.toLowerCase()
    : status.vm_status;

  const isRunning = vmStatus === 'running';
  const isStopped = vmStatus === 'stopped' || vmStatus === 'notcreated';
  const isStarting = vmStatus === 'starting';
  const isStopping = vmStatus === 'stopping';
  const isError = typeof vmStatus === 'object' && vmStatus !== null && 'error' in vmStatus;

  const getStatusColor = () => {
    if (isRunning) return 'var(--success)';
    if (isStopped) return 'var(--text-tertiary)';
    if (isStarting || isStopping) return '#f59e0b';
    return 'var(--accent)';
  };

  const getStatusText = () => {
    if (isRunning) return 'Running';
    if (vmStatus === 'notcreated') return 'Ready to start';
    if (vmStatus === 'stopped') return 'Stopped';
    if (isStarting) return 'Starting...';
    if (isStopping) return 'Stopping...';
    if (isError) {
      return `Error`;
    }
    return 'Ready';
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await onStart();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await onStop();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    try {
      await onRestart();
    } finally {
      setActionLoading(false);
    }
  };

  const isLoading = loading || actionLoading;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="status-indicator">
          <span
            className={`status-dot ${isRunning ? 'running' : ''} ${isStarting || isStopping ? 'loading' : ''}`}
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{getStatusText()}</span>
        </div>
        <div className="header-actions">
          <button
            className="btn-icon"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {isRunning && status.gateway_url ? (
          <iframe
            src={status.gateway_url}
            className="webchat-frame"
            title="OpenClaw WebChat"
          />
        ) : (
          <div className="vm-controls">
            {isStopped && !isLoading && (
              <>
                <div className="vm-stopped-icon">🦞</div>
                <h2>ClawBox is ready</h2>
                <p>Start the assistant to begin chatting</p>
                <button
                  className="btn-primary btn-large"
                  onClick={handleStart}
                  disabled={isLoading}
                >
                  Start ClawBox
                </button>
              </>
            )}

            {(isStarting || (isStopped && isLoading)) && (
              <>
                <div className="spinner large" />
                <h2>Starting ClawBox...</h2>
                <p>This may take a moment</p>
              </>
            )}

            {isStopping && (
              <>
                <div className="spinner large" />
                <h2>Stopping ClawBox...</h2>
                <p>Shutting down gracefully</p>
              </>
            )}

            {isError && (
              <>
                <div className="error-icon">⚠️</div>
                <h2>Something went wrong</h2>
                <p>{typeof vmStatus === 'object' && 'error' in vmStatus ? vmStatus.error : 'Unknown error'}</p>
                <button className="btn-primary" onClick={handleRestart} disabled={isLoading}>
                  Try Restart
                </button>
              </>
            )}

            {isRunning && !status.gateway_url && (
              <>
                <div className="spinner large" />
                <h2>Connecting...</h2>
                <p>Waiting for OpenClaw to be ready</p>
              </>
            )}
          </div>
        )}
      </div>

      {isRunning && (
        <footer className="dashboard-footer">
          <div className="footer-stats">
            <span>🟢 Connected</span>
          </div>
          <div className="footer-actions">
            <button
              className="btn-secondary btn-small"
              onClick={handleRestart}
              disabled={isLoading}
            >
              Restart
            </button>
            <button
              className="btn-danger btn-small"
              onClick={handleStop}
              disabled={isLoading}
            >
              Stop
            </button>
          </div>
        </footer>
      )}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h3>Channels</h3>
                <p className="settings-desc">Configure how you connect to your assistant</p>
                <div className="settings-item">
                  <span>Telegram Bot Token</span>
                  <input type="password" placeholder="Enter token..." />
                </div>
              </div>
              <div className="settings-section">
                <h3>Resources</h3>
                <p className="settings-desc">Adjust VM resources (requires restart)</p>
                <div className="settings-item">
                  <span>Memory</span>
                  <span className="settings-value">4 GB</span>
                </div>
                <div className="settings-item">
                  <span>CPU Cores</span>
                  <span className="settings-value">2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
