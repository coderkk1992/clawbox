import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SetupWizard } from './pages/SetupWizard';
import { AgentOnboarding, type AgentConfig } from './pages/AgentOnboarding';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import type { SetupProgressEvent } from './types';
import './App.css';

type AppView = 'loading' | 'setup' | 'onboarding' | 'dashboard' | 'chat';

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupProgress, setSetupProgress] = useState<SetupProgressEvent | null>(null);
  const [vmLoading, setVmLoading] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const vmStatus = await invoke('get_vm_status');
      setStatus(vmStatus);
    } catch (e) {
      console.error('Failed to get VM status:', e);
    }
  }, []);

  // Initialize app - only run once on mount
  useEffect(() => {
    // Clear localStorage for fresh start
    localStorage.clear();

    const init = async () => {
      try {
        const sysInfo = await invoke('get_system_info') as any;
        setSystemInfo(sysInfo);

        const vmStatus = await invoke('get_vm_status');
        setStatus(vmStatus);

        // Determine initial view - only if still loading
        setView(currentView => {
          if (currentView !== 'loading') return currentView; // Don't change if already set
          if (!sysInfo.setup_complete) {
            return 'setup';
          } else {
            const onboardingComplete = localStorage.getItem('clawbox_onboarding_complete');
            if (!onboardingComplete) {
              return 'onboarding';
            } else {
              // Go directly to chat after setup is complete
              return 'chat';
            }
          }
        });
      } catch (e) {
        console.error('Error:', e);
        setError(String(e));
        setSystemInfo({ total_ram_mb: 16384, cpu_count: 4, setup_complete: false });
        setStatus({ vm_status: 'notcreated', gateway_url: null, ready: false });
        setView('setup');
      }
    };
    init();

    // Listen for setup progress events
    const unlisten = listen<SetupProgressEvent>('setup-progress', (event) => {
      setSetupProgress(event.payload);

      if (event.payload.step === 'complete') {
        setIsSettingUp(false);
        setView('onboarding');
        invoke('get_system_info').then((sysInfo: any) => {
          setSystemInfo(sysInfo);
        });
        refreshStatus();
      } else if (event.payload.step === 'error') {
        setIsSettingUp(false);
        setError(event.payload.message);
      }
    });

    // Listen for tray menu "Open Chat" event
    const unlistenChat = listen('open-chat', () => {
      setView(currentView => currentView === 'dashboard' ? 'chat' : currentView);
    });

    return () => {
      unlisten.then(fn => fn());
      unlistenChat.then(fn => fn());
    };
  }, [refreshStatus]);

  // Fetch gateway token when chat view is opened or VM is running
  useEffect(() => {
    if (view === 'chat' && status?.vm_status === 'running' && !gatewayToken) {
      invoke('get_gateway_token').then((token) => {
        if (token) setGatewayToken(token as string);
      }).catch((e) => {
        console.error('Failed to get gateway token:', e);
      });
    }
  }, [view, status?.vm_status, gatewayToken]);

  const handleStart = async () => {
    setVmLoading(true);
    setError(null);
    setStatus((prev: any) => ({ ...prev, vm_status: 'starting' }));

    try {
      await invoke('start_vm');

      let attempts = 0;
      const maxAttempts = 30;
      const pollStatus = async () => {
        attempts++;
        await refreshStatus();
        const currentStatus = await invoke('get_vm_status') as any;

        if (currentStatus.vm_status === 'running') {
          setStatus(currentStatus);
          setVmLoading(false);
          // Fetch gateway token when VM is running
          try {
            const token = await invoke('get_gateway_token') as string | null;
            setGatewayToken(token);
          } catch (e) {
            console.error('Failed to get gateway token:', e);
          }
        } else if (attempts < maxAttempts && currentStatus.vm_status !== 'stopped') {
          setTimeout(pollStatus, 1000);
        } else {
          setStatus(currentStatus);
          setVmLoading(false);
        }
      };

      setTimeout(pollStatus, 2000);
    } catch (e) {
      console.error('Failed to start VM:', e);
      setError(String(e));
      setVmLoading(false);
      await refreshStatus();
    }
  };

  const handleStop = async () => {
    setVmLoading(true);
    setError(null);
    setStatus((prev: any) => ({ ...prev, vm_status: 'stopping' }));

    try {
      await invoke('stop_vm');
      await refreshStatus();
    } catch (e) {
      console.error('Failed to stop VM:', e);
      setError(String(e));
    } finally {
      setVmLoading(false);
    }
  };

  const handleRestart = async () => {
    setVmLoading(true);
    setError(null);
    setStatus((prev: any) => ({ ...prev, vm_status: 'stopping' }));

    try {
      await invoke('restart_vm');

      let attempts = 0;
      const pollStatus = async () => {
        attempts++;
        const currentStatus = await invoke('get_vm_status') as any;
        if (currentStatus.vm_status === 'running' || attempts >= 30) {
          setStatus(currentStatus);
          setVmLoading(false);
        } else {
          setTimeout(pollStatus, 1000);
        }
      };
      setTimeout(pollStatus, 2000);
    } catch (e) {
      console.error('Failed to restart VM:', e);
      setError(String(e));
      setVmLoading(false);
      await refreshStatus();
    }
  };

  const handleOnboardingComplete = async (config: AgentConfig) => {
    setError(null);

    try {
      // Configure the agent in OpenClaw
      const agentConfig = {
        persona: config.persona,
        name: config.name,
        preferences: config.preferences,
        capabilities: config.capabilities,
        telegram_bot_token: null,
        telegram_bot_username: null,
      };

      await invoke('configure_agent', { config: agentConfig });

      // Save locally
      localStorage.setItem('clawbox_onboarding_complete', 'true');
      localStorage.setItem('clawbox_agent_config', JSON.stringify(config));

      // Go to chat after onboarding
      setView('chat');
    } catch (e) {
      console.error('Failed to configure agent:', e);
      setError(String(e));
      // Still move to chat but show error
      localStorage.setItem('clawbox_onboarding_complete', 'true');
      localStorage.setItem('clawbox_agent_config', JSON.stringify(config));
      setView('chat');
    }
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('clawbox_onboarding_complete', 'true');
    // Go to chat after skipping onboarding
    setView('chat');
  };

  if (view === 'loading') {
    return (
      <div className="app loading-screen">
        <div className="spinner large" />
        <p>Loading ClawBox...</p>
        {error && <p style={{ color: 'red', fontSize: '12px' }}>{error}</p>}
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <div className="app">
        {error && <div className="error-banner">{error}</div>}
        <SetupWizard
          systemInfo={systemInfo || { total_ram_mb: 16384, cpu_count: 4, setup_complete: false }}
          onComplete={async (config) => {
            setIsSettingUp(true);
            setSetupProgress({ step: 'starting', progress: 0, message: 'Starting setup...' });
            setError(null);
            try {
              await invoke('run_full_setup', { config });
            } catch (e) {
              console.error('Setup error:', e);
              setError(String(e));
              setIsSettingUp(false);
            }
          }}
          isSettingUp={isSettingUp}
          setupProgress={setupProgress}
        />
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <div className="app">
        {error && <div className="error-banner">{error}</div>}
        <AgentOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </div>
    );
  }

  if (view === 'chat') {
    return (
      <div className="app">
        {error && <div className="error-banner">{error}</div>}
        {status ? (
          <Chat
            status={status}
            onBack={() => setView('dashboard')}
            onOpenSettings={() => setView('dashboard')}
          />
        ) : (
          <div className="app loading-screen">
            <div className="spinner large" />
            <p>Connecting...</p>
          </div>
        )}
      </div>
    );
  }

  const isRunning = status?.vm_status === 'running';

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}
      {status && (
        <>
          <Dashboard
            status={status}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
            loading={vmLoading}
          />
          {isRunning && (
            <button
              className="chat-fab"
              onClick={() => setView('chat')}
              title="Open Chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default App;
