import { useState } from 'react';
import type { SystemInfo, SetupConfig, SetupProgressEvent, Provider } from '../types';
import { AnthropicLogo, OpenAILogo, ClawBoxLogo, OllamaLogo } from '../components/Icons';

interface Props {
  systemInfo: SystemInfo;
  onComplete: (config: SetupConfig) => Promise<void>;
  isSettingUp: boolean;
  setupProgress: SetupProgressEvent | null;
}

type Step = 'welcome' | 'resources' | 'provider' | 'apikey' | 'localmodel' | 'installing' | 'complete';

const TOTAL_STEPS = 4;

// Recommended local models based on RAM
const LOCAL_MODELS = [
  { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', size: '~4.7GB', minRam: 8192, desc: 'Best for coding tasks', recommended: true },
  { id: 'qwen3:8b', name: 'Qwen 3 8B', size: '~5GB', minRam: 8192, desc: 'General purpose' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', size: '~2GB', minRam: 4096, desc: 'Fast & lightweight' },
  { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', size: '~5GB', minRam: 8192, desc: 'Reasoning focused' },
];

export function SetupWizard({ systemInfo, onComplete, isSettingUp, setupProgress }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [ramMb, setRamMb] = useState(4096);
  const [cpus, setCpus] = useState(2);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [localModel, setLocalModel] = useState('qwen2.5-coder:7b');
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxRam = Math.floor(systemInfo.total_ram_mb * 0.75);
  const maxCpus = systemInfo.cpu_count;

  const goToStep = (newStep: Step, index: number) => {
    setStep(newStep);
    setStepIndex(index);
  };

  const handleProviderSelect = (selectedProvider: Provider) => {
    setProvider(selectedProvider);
    if (selectedProvider === 'local') {
      goToStep('localmodel', 3);
    } else {
      goToStep('apikey', 3);
    }
  };

  const handleInstall = async () => {
    goToStep('installing', 4);
    setError(null);

    try {
      const config: SetupConfig = {
        ram_mb: ramMb,
        cpus,
        provider: provider!,
      };

      if (provider === 'anthropic') {
        config.anthropic_api_key = apiKey;
      } else if (provider === 'openai') {
        config.openai_api_key = apiKey;
      } else if (provider === 'local') {
        config.local_model = useCustomModel ? customModel : localModel;
      }

      await onComplete(config);
    } catch (e) {
      setError(String(e));
      if (provider === 'local') {
        goToStep('localmodel', 3);
      } else {
        goToStep('apikey', 3);
      }
    }
  };

  // Check if installation just completed
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
                <span className="progress-step">{getProgressMessage(currentSetupStep, provider)}</span>
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
              {provider === 'local' && (
                <ChecklistItem
                  label="Installing Ollama"
                  status={getChecklistStatus('ollama', currentSetupStep)}
                />
              )}
              {provider === 'local' && (
                <ChecklistItem
                  label="Downloading AI model"
                  status={getChecklistStatus('model', currentSetupStep)}
                />
              )}
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
                onClick={() => handleProviderSelect('anthropic')}
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
                onClick={() => handleProviderSelect('openai')}
              >
                <div className="provider-icon"><OpenAILogo size={28} /></div>
                <div className="provider-info">
                  <div className="provider-name">GPT by OpenAI</div>
                  <div className="provider-desc">Fast and versatile</div>
                </div>
              </button>

              <button
                className={`provider-card ${provider === 'local' ? 'selected' : ''}`}
                onClick={() => handleProviderSelect('local')}
              >
                <div className="provider-icon"><OllamaLogo size={28} /></div>
                <div className="provider-info">
                  <div className="provider-name">Local Model</div>
                  <div className="provider-desc">Run AI entirely on your Mac</div>
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

        {/* Local Model Selection */}
        {step === 'localmodel' && (
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
              Choose AI Model
            </h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px', fontSize: '15px' }}>
              Select a model to run locally on your Mac
            </p>

            <div className="local-model-info">
              <div className="local-model-info-icon">🏠</div>
              <div className="local-model-info-content">
                <strong>100% Private</strong>
                <p>Local models run entirely on your Mac. No API keys needed, no data sent anywhere.</p>
              </div>
            </div>

            <div className="local-model-warning">
              <div className="local-model-warning-icon">⚠️</div>
              <div className="local-model-warning-content">
                <strong>Limited Capabilities</strong>
                <p>Local models may struggle with file creation, code execution, and complex tasks. For full agent capabilities, use Claude.</p>
              </div>
            </div>

            {!useCustomModel ? (
              <div className="model-cards">
                {LOCAL_MODELS.filter(m => systemInfo.total_ram_mb >= m.minRam).map((model) => (
                  <button
                    key={model.id}
                    className={`model-card ${localModel === model.id ? 'selected' : ''}`}
                    onClick={() => setLocalModel(model.id)}
                  >
                    <div className="model-card-header">
                      <div className="model-name">{model.name}</div>
                      {model.recommended && <div className="model-badge">Recommended</div>}
                    </div>
                    <div className="model-meta">
                      <span className="model-size">{model.size}</span>
                      <span className="model-desc">{model.desc}</span>
                    </div>
                  </button>
                ))}

                <button
                  className="model-card custom"
                  onClick={() => setUseCustomModel(true)}
                >
                  <div className="model-card-header">
                    <div className="model-name">Custom Model</div>
                  </div>
                  <div className="model-meta">
                    <span className="model-desc">Enter any Ollama model name</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="custom-model-input">
                <div className="form-group">
                  <label>Ollama Model Name</label>
                  <input
                    type="text"
                    placeholder="e.g., llama3.3:70b, codellama:13b"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    autoFocus
                  />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  Browse models at <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="link">ollama.com/library</a>
                </p>
                <button
                  className="btn-text"
                  onClick={() => { setUseCustomModel(false); setCustomModel(''); }}
                  style={{ marginTop: '12px' }}
                >
                  ← Back to recommended models
                </button>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="wizard-nav">
              <button className="btn-secondary" onClick={() => goToStep('provider', 2)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleInstall}
                disabled={useCustomModel ? !customModel : !localModel}
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

function getProgressMessage(step: string, provider: Provider | null): string {
  const isLocal = provider === 'local';
  switch (step) {
    case 'starting': return 'Starting setup...';
    case 'lima': return 'Preparing environment...';
    case 'vm': return 'Creating sandbox...';
    case 'ollama': return isLocal ? 'Installing Ollama on your Mac...' : 'Installing Ollama...';
    case 'model': return isLocal ? 'Downloading local AI model (this may take a few minutes)...' : 'Downloading AI model...';
    case 'openclaw': return 'Installing assistant...';
    case 'gateway': return 'Starting services...';
    case 'warming': return 'Loading AI model into memory...';
    case 'config': return 'Configuring...';
    case 'complete': return 'All done!';
    default: return 'Setting up...';
  }
}

function getChecklistStatus(itemStep: string, currentStep: string): 'pending' | 'active' | 'complete' {
  const order = ['starting', 'lima', 'vm', 'ollama', 'model', 'openclaw', 'gateway', 'warming', 'config', 'complete'];
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
