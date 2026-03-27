import { useState } from 'react';
import { ALL_PIXEL_CHARACTERS } from './PixelCharacters';

interface Props {
  onClose: () => void;
  onCreate: (config: CreateAgentConfig) => Promise<void>;
}

export interface CreateAgentConfig {
  name: string;
  persona: string;
  avatar: string;
  preferences: Record<string, string>;
  capabilities: string[];
}

type Step = 'persona' | 'avatar' | 'name';

const PERSONAS = [
  { id: 'assistant', name: 'Personal Assistant', emoji: '🦞', description: 'Helpful everyday assistant' },
  { id: 'coder', name: 'Developer', emoji: '👨‍💻', description: 'Pair programmer & debugger' },
  { id: 'researcher', name: 'Researcher', emoji: '🔬', description: 'Deep analysis & fact-checking' },
  { id: 'creative', name: 'Creative', emoji: '🎨', description: 'Writing & brainstorming' },
  { id: 'tutor', name: 'Tutor', emoji: '📚', description: 'Teaching & explanations' },
  { id: 'custom', name: 'Custom', emoji: '✨', description: 'Design your own' },
];

export function CreateAgentModal({ onClose, onCreate }: Props) {
  const [step, setStep] = useState<Step>('persona');
  const [persona, setPersona] = useState<string>('');
  const [avatar, setAvatar] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  const handlePersonaSelect = (personaId: string) => {
    setPersona(personaId);
    // Default avatar based on persona
    const defaultAvatars: Record<string, string> = {
      'assistant': 'lobster',
      'coder': 'wizard',
      'researcher': 'scientist',
      'creative': 'artist',
      'tutor': 'teacher',
      'custom': 'robot',
    };
    setAvatar(defaultAvatars[personaId] || 'lobster');
    setStep('avatar');
  };

  const handleAvatarSelect = (avatarId: string) => {
    setAvatar(avatarId);
    setStep('name');
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        persona,
        avatar,
        preferences: {},
        capabilities: [],
      });
      onClose();
    } catch (e) {
      console.error('Failed to create agent:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    if (step === 'name') setStep('avatar');
    else if (step === 'avatar') setStep('persona');
    else onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-agent-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {step === 'persona' && (
          <>
            <h2>Create New Agent</h2>
            <p className="modal-subtitle">What kind of agent do you want?</p>

            <div className="persona-select-grid">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  className="persona-select-item"
                  onClick={() => handlePersonaSelect(p.id)}
                >
                  <span className="persona-select-emoji">{p.emoji}</span>
                  <span className="persona-select-name">{p.name}</span>
                  <span className="persona-select-desc">{p.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'avatar' && (
          <>
            <h2>Choose Avatar</h2>
            <p className="modal-subtitle">Pick a character for your agent</p>

            <div className="avatar-select-grid">
              {ALL_PIXEL_CHARACTERS.map((char) => {
                const Component = char.component;
                return (
                  <button
                    key={char.id}
                    className={`avatar-select-item ${avatar === char.id ? 'selected' : ''}`}
                    onClick={() => handleAvatarSelect(char.id)}
                  >
                    <Component size={48} />
                    <span className="avatar-select-name">{char.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleBack}>
                Back
              </button>
            </div>
          </>
        )}

        {step === 'name' && (
          <>
            <h2>Name Your Agent</h2>
            <p className="modal-subtitle">Give your agent a memorable name</p>

            <div className="name-input-preview">
              {(() => {
                const char = ALL_PIXEL_CHARACTERS.find(c => c.id === avatar);
                if (char) {
                  const Component = char.component;
                  return <Component size={64} />;
                }
                return null;
              })()}
            </div>

            <input
              type="text"
              className="agent-name-input"
              placeholder="e.g., Atlas, Friday, Jarvis..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleCreate()}
              autoFocus
            />

            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleBack}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={!name.trim() || isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
