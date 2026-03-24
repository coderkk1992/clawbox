import { useState } from 'react';
import type { SystemInfo, SetupConfig, SetupProgressEvent } from '../types';
import { AnthropicLogo, OpenAILogo, LocalLogo, ClawBoxLogo } from '../components/Icons';

interface Props {
  systemInfo: SystemInfo;
  onComplete: (config: SetupConfig) => Promise<void>;
  isSettingUp: boolean;
  setupProgress: SetupProgressEvent | null;
}

type Step = 'welcome' | 'resources' | 'provider' | 'apikey' | 'installing' | 'complete';
type Provider = 'anthropic' | 'openai' | 'local';

const TOTAL_STEPS = 4;

export function SetupWizard({ systemInfo, onComplete, isSettingUp, setupProgress }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [ramMb, setRamMb] = useState(4096);
  const [cpus, setCpus] = useState(2);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const maxRam = Math.floor(systemInfo.total_ram_mb * 0.75);
  const maxCpus = systemInfo.cpu_count;

  const goToStep = (newStep: Step, index: number) => {
    setStep(newStep);
    setStepIndex(index);
  };

  const handleInstall = async () => {
    goToStep('installing', 4);
    setError(null);

    try {
      await onComplete({
        ram_mb: ramMb,
        cpus,
        anthropic_api_key: provider === 'anthropic' ? apiKey : undefined,
        openai_api_key: provider === 'openai' ? apiKey : undefined,
      });
    } catch (e) {
      setError(String(e));
      goToStep('apikey', 3);
    }
  };


  // Check if installation just completed - show Telegram setup if selected
  const setupComplete = setupProgress?.step === 'complete';

  // Installing state
  if ((step === 'installing' || isSettingUp) && !setupComplete) {
    const progress = setupProgress?.progress ?? 0;
    const currentSetupStep = setupProgress?.step ?? 'starting';

    return (
      <div className="wizard">
        <div className="wizard-content">
          <div className="installing-step">
            <div className="installing-icon">
              <div className="installing-icon-inner"><ClawBoxLogo size={48} /></div>
            </div>
            <h2>Setting up your assistant</h2>
            <p className="subtitle">This may take a few minutes on first run</p>

            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-label">
                <span className="progress-step">{getProgressMessage(currentSetupStep)}</span>
                <span className="progress-percent">{progress}%</span>
              </div>
            </div>

            <div className="setup-checklist">
              <ChecklistItem
                label="Preparing secure environment"
                status={getChecklistStatus('lima', currentSetupStep)}
              />
              <ChecklistItem
                label="Creating isolated sandbox"
                status={getChecklistStatus('vm', currentSetupStep)}
              />
              <ChecklistItem
                label="Installing OpenClaw"
                status={getChecklistStatus('openclaw', currentSetupStep)}
              />
              <ChecklistItem
                label="Starting your assistant"
                status={getChecklistStatus('gateway', currentSetupStep)}
              />
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Installation complete
  if (setupComplete || step === 'complete') {
    return (
      <div className="wizard">
        <div className="wizard-content">
          <div className="complete-step">
            <div className="complete-icon">🎉</div>
            <h2>You're all set!</h2>
            <p className="subtitle">Your AI assistant is ready to use</p>

            <button
              className="btn-primary btn-large btn-full"
              onClick={() => window.location.reload()}
            >
              Open ClawBox
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <div className="wizard-content">
        {/* Step dots */}
        <div className="step-dots">
          {[...Array(TOTAL_STEPS)].map((_, i) => (
            <div
              key={i}
              className={`step-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Welcome */}
        {step === 'welcome' && (
          <div className="welcome-step">
            <div className="welcome-icon"><ClawBoxLogo size={48} /></div>
            <h1>Welcome to ClawBox</h1>
            <p className="tagline">
              Your personal AI assistant that respects your privacy
              and keeps your data safe.
            </p>

            <div className="trust-badges">
              <div className="trust-badge">
                <div className="trust-badge-icon">🔒</div>
                <div className="trust-badge-text">
                  <div className="trust-badge-title">Runs in isolation</div>
                  <div className="trust-badge-desc">Sandboxed environment with no access to your files</div>
                </div>
              </div>
              <div className="trust-badge">
                <div className="trust-badge-icon">🏠</div>
                <div className="trust-badge-text">
                  <div className="trust-badge-title">Stays on your Mac</div>
                  <div className="trust-badge-desc">Everything runs locally, your data never leaves</div>
                </div>
              </div>
              <div className="trust-badge">
                <div className="trust-badge-icon">⚡</div>
                <div className="trust-badge-text">
                  <div className="trust-badge-title">Always available</div>
                  <div className="trust-badge-desc">Message from Telegram, Discord, or web</div>
                </div>
              </div>
            </div>

            <button
              className="btn-primary btn-large btn-full"
              onClick={() => goToStep('resources', 1)}
            >
              Get Started
            </button>
          </div>
        )}

        {/* Resources */}
        {step === 'resources' && (
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
              Allocate Resources
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px', fontSize: '15px' }}>
              Decide how much power to give your assistant
            </p>

            <div className="resources-info-box">
              <div className="resources-info-icon">💡</div>
              <div className="resources-info-content">
                <strong>What is this for?</strong>
                <p>ClawBox runs your AI assistant in a secure, isolated environment on your Mac. These resources are dedicated to that environment while it's running.</p>
              </div>
            </div>

            <div className="form-section">
              <div className="form-group">
                <div className="form-label">
                  <span className="form-label-text">Memory</span>
                  <span className="form-label-value">{(ramMb / 1024).toFixed(1)} GB</span>
                </div>
                <div className="range-slider">
                  <input
                    type="range"
                    min={2048}
                    max={maxRam}
                    step={512}
                    value={ramMb}
                    onChange={(e) => setRamMb(Number(e.target.value))}
                  />
                </div>
                <div className="range-ticks">
                  <span>2 GB</span>
                  <span>Recommended: 4-8 GB</span>
                  <span>{(maxRam / 1024).toFixed(0)} GB</span>
                </div>
              </div>

              <div className="form-group">
                <div className="form-label">
                  <span className="form-label-text">CPU Cores</span>
                  <span className="form-label-value">{cpus} {cpus === 1 ? 'core' : 'cores'}</span>
                </div>
                <div className="range-slider">
                  <input
                    type="range"
                    min={1}
                    max={maxCpus}
                    step={1}
                    value={cpus}
                    onChange={(e) => setCpus(Number(e.target.value))}
                  />
                </div>
                <div className="range-ticks">
                  <span>1</span>
                  <span></span>
                  <span>{maxCpus}</span>
                </div>
              </div>
            </div>

            <div className="resources-tip">
              <span>💻</span>
              <span>Your Mac has {(systemInfo.total_ram_mb / 1024).toFixed(0)} GB RAM and {systemInfo.cpu_count} CPU cores. We'll leave plenty for your other apps.</span>
            </div>

            <div className="wizard-nav">
              <button className="btn-secondary" onClick={() => goToStep('welcome', 0)}>
                Back
              </button>
              <button className="btn-primary" onClick={() => goToStep('provider', 2)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Provider */}
        {step === 'provider' && (
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
              Choose AI Provider
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px', fontSize: '15px' }}>
              Power your assistant with your preferred AI
            </p>

            <div className="provider-cards">
              <button
                className={`provider-card ${provider === 'anthropic' ? 'selected' : ''}`}
                onClick={() => { setProvider('anthropic'); goToStep('apikey', 3); }}
              >
                <div className="provider-icon"><AnthropicLogo size={28} /></div>
                <div className="provider-info">
                  <div className="provider-name">Claude by Anthropic</div>
                  <div className="provider-desc">Most capable for complex reasoning</div>
                </div>
                <div className="provider-badge">Recommended</div>
              </button>

              <button
                className={`provider-card ${provider === 'openai' ? 'selected' : ''}`}
                onClick={() => { setProvider('openai'); goToStep('apikey', 3); }}
              >
                <div className="provider-icon"><OpenAILogo size={28} /></div>
                <div className="provider-info">
                  <div className="provider-name">GPT by OpenAI</div>
                  <div className="provider-desc">Fast and versatile</div>
                </div>
              </button>

              <button
                className={`provider-card ${provider === 'local' ? 'selected' : ''}`}
                onClick={() => { setProvider('local'); handleInstall(); }}
              >
                <div className="provider-icon"><LocalLogo size={28} /></div>
                <div className="provider-info">
                  <div className="provider-name">Local with Ollama</div>
                  <div className="provider-desc">100% private, runs on your machine</div>
                </div>
                <div className="provider-badge free">Free</div>
              </button>
            </div>

            <div className="wizard-nav">
              <button className="btn-secondary" onClick={() => goToStep('resources', 1)}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* API Key */}
        {step === 'apikey' && (
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
              Connect Your Account
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px', fontSize: '15px' }}>
              Enter your {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key
            </p>

            <div className="form-group">
              <input
                type="password"
                placeholder={provider === 'anthropic' ? 'sk-ant-api03-...' : 'sk-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
            </div>

            <p style={{ textAlign: 'center', marginBottom: '24px' }}>
              <a
                href={provider === 'anthropic'
                  ? 'https://console.anthropic.com/settings/keys'
                  : 'https://platform.openai.com/api-keys'}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Get your API key →
              </a>
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="wizard-nav">
              <button className="btn-secondary" onClick={() => goToStep('provider', 2)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleInstall}
                disabled={!apiKey}
              >
                Install ClawBox
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getProgressMessage(step: string): string {
  switch (step) {
    case 'starting': return 'Starting setup...';
    case 'lima': return 'Preparing environment...';
    case 'vm': return 'Creating sandbox...';
    case 'openclaw': return 'Installing assistant...';
    case 'gateway': return 'Starting services...';
    case 'config': return 'Configuring API keys...';
    case 'complete': return 'All done!';
    default: return 'Setting up...';
  }
}

function getChecklistStatus(itemStep: string, currentStep: string): 'pending' | 'active' | 'complete' {
  const order = ['starting', 'lima', 'vm', 'openclaw', 'gateway', 'config', 'complete'];
  const currentIndex = order.indexOf(currentStep);
  const itemIndex = order.indexOf(itemStep);

  if (currentStep === 'complete' || itemIndex < currentIndex) return 'complete';
  if (itemIndex === currentIndex) return 'active';
  return 'pending';
}

function ChecklistItem({ label, status }: { label: string; status: 'pending' | 'active' | 'complete' }) {
  return (
    <div className="setup-checklist-item">
      <div className={`checklist-icon ${status}`}>
        {status === 'complete' && '✓'}
        {status === 'active' && <span className="spinner small" />}
        {status === 'pending' && '○'}
      </div>
      <div className="checklist-text">
        <div className={`checklist-title ${status}`}>{label}</div>
      </div>
    </div>
  );
}
