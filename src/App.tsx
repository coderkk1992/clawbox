import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SetupWizard } from './pages/SetupWizard';
import { AgentOnboarding, type AgentConfig } from './pages/AgentOnboarding';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { AgentSidebar, type Agent } from './components/AgentSidebar';
import { CreateAgentModal, type CreateAgentConfig } from './components/CreateAgentModal';
import type { SetupProgressEvent } from './types';
import './App.css';

type AppView = 'loading' | 'setup' | 'onboarding' | 'dashboard' | 'chat' | 'cleanup';

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupProgress, setSetupProgress] = useState<SetupProgressEvent | null>(null);
  const [vmLoading, setVmLoading] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Multi-agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const vmStatus = await invoke('get_vm_status');
      setStatus(vmStatus);
    } catch (e) {
      console.error('Failed to get VM status:', e);
    }
  }, []);

  // Load agents
  const loadAgents = useCallback(async () => {
    try {
      const agentsList = await invoke('list_agents') as Agent[];
      setAgents(agentsList);

      // Get active agent
      const active = await invoke('get_active_agent') as Agent | null;
      if (active) {
        setActiveAgent(active);
        // Sync to localStorage for Chat component
        localStorage.setItem('clawbox_agent_config', JSON.stringify({
          name: active.name,
          persona: active.persona,
          avatar: active.avatar,
        }));
      }
    } catch (e) {
      console.error('Failed to load agents:', e);
    }
  }, []);

  // Initialize app - only run once on mount
  useEffect(() => {
    const init = async () => {
      try {
        const sysInfo = await invoke('get_system_info') as any;
        setSystemInfo(sysInfo);

        const vmStatus = await invoke('get_vm_status');
        setStatus(vmStatus);

        // Check for orphaned VM (from previous incomplete install)
        if (!sysInfo.setup_complete) {
          const hasOrphan = await invoke('check_orphaned_vm') as boolean;
          if (hasOrphan) {
            setView('cleanup');
            return;
          }
        }

        // Load agents
        await loadAgents();

        // Determine initial view - only if still loading
        setView(currentView => {
          if (currentView !== 'loading') return currentView;
          if (!sysInfo.setup_complete) {
            return 'setup';
          } else {
            // Check if we have any agents
            return 'chat'; // Will show onboarding in chat if no agents
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
  }, [refreshStatus, loadAgents]);

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
      // Create the agent in the backend
      const newAgent = await invoke('create_agent', {
        config: {
          name: config.name,
          persona: config.persona,
          avatar: config.persona, // Use persona as default avatar
          preferences: config.preferences,
          capabilities: config.capabilities,
        }
      }) as Agent;

      // Configure OpenClaw with the agent
      const agentConfig = {
        persona: config.persona,
        name: config.name,
        preferences: config.preferences,
        capabilities: config.capabilities,
        telegram_bot_token: null,
        telegram_bot_username: null,
      };

      await invoke('configure_agent', { config: agentConfig });

      // Update local state
      setAgents(prev => [...prev, newAgent]);
      setActiveAgent(newAgent);

      // Sync to localStorage
      localStorage.setItem('clawbox_agent_config', JSON.stringify(config));

      // Go to chat after onboarding
      setView('chat');
    } catch (e) {
      console.error('Failed to configure agent:', e);
      setError(String(e));
      setView('chat');
    }
  };

  const handleOnboardingSkip = () => {
    setView('chat');
  };

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    setError(null);
    try {
      await invoke('full_cleanup');
      setView('setup');
    } catch (e) {
      console.error('Cleanup error:', e);
      setError(String(e));
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleSkipCleanup = () => {
    setView('setup');
  };

  const handleSelectAgent = async (agent: Agent) => {
    try {
      await invoke('switch_agent', { id: agent.id });
      setActiveAgent(agent);
      // Sync to localStorage for Chat component
      localStorage.setItem('clawbox_agent_config', JSON.stringify({
        name: agent.name,
        persona: agent.persona,
        avatar: agent.avatar,
      }));
    } catch (e) {
      console.error('Failed to switch agent:', e);
      setError(String(e));
    }
  };

  const handleCreateAgent = async (config: CreateAgentConfig) => {
    try {
      const newAgent = await invoke('create_agent', { config }) as Agent;
      setAgents(prev => [...prev, newAgent]);

      // Switch to the new agent
      await handleSelectAgent(newAgent);

      // Configure OpenClaw
      await invoke('configure_agent', {
        config: {
          persona: config.persona,
          name: config.name,
          preferences: config.preferences,
          capabilities: config.capabilities,
          telegram_bot_token: null,
          telegram_bot_username: null,
        }
      });
    } catch (e) {
      console.error('Failed to create agent:', e);
      throw e;
    }
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

  if (view === 'cleanup') {
    return (
      <div className="app">
        <div className="setup-wizard">
          <div className="setup-content" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔧</div>
            <h2>Previous Installation Found</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', maxWidth: '400px', margin: '0 auto 30px' }}>
              We found data from a previous ClawBox installation. Would you like to clean it up and start fresh, or continue with the existing setup?
            </p>
            {error && <p style={{ color: 'var(--error)', marginBottom: '20px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="setup-button secondary"
                onClick={handleSkipCleanup}
                disabled={isCleaningUp}
              >
                Keep Existing
              </button>
              <button
                className="setup-button"
                onClick={handleCleanup}
                disabled={isCleaningUp}
              >
                {isCleaningUp ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                    Cleaning up...
                  </>
                ) : (
                  'Start Fresh'
                )}
              </button>
            </div>
          </div>
        </div>
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

  // Chat view with sidebar (only show sidebar if we have agents)
  if (view === 'chat') {
    // If no agents exist, show onboarding first
    if (agents.length === 0) {
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

    return (
      <div className="app app-with-sidebar">
        {error && <div className="error-banner">{error}</div>}

        <AgentSidebar
          agents={agents}
          activeAgentId={activeAgent?.id || null}
          onSelectAgent={handleSelectAgent}
          onCreateAgent={() => setShowCreateModal(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="app-main">
          {status ? (
            <Chat
              status={status}
              onBack={() => setView('dashboard')}
              onOpenSettings={() => setView('dashboard')}
              activeAgentId={activeAgent?.id || null}
            />
          ) : (
            <div className="app loading-screen">
              <div className="spinner large" />
              <p>Connecting...</p>
            </div>
          )}
        </div>

        {showCreateModal && (
          <CreateAgentModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateAgent}
          />
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
