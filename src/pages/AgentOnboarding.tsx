import { useState, useEffect } from 'react';
import { ClawBoxLogo } from '../components/Icons';

interface Props {
  onComplete: (config: AgentConfig) => Promise<void>;
  onSkip: () => void;
}

export interface AgentConfig {
  persona: PersonaPreset | 'custom';
  name: string;
  preferences: Record<string, string>;
  capabilities: string[];
}

type PersonaPreset = 'assistant' | 'coder' | 'researcher' | 'creative' | 'tutor' | 'custom';

interface Preset {
  id: PersonaPreset;
  name: string;
  emoji: string;
  description: string;
  tagline: string;
  defaultCapabilities: string[];
  gradient: string;
  questions: Question[];
}

interface Question {
  id: string;
  question: string;
  type: 'select' | 'text' | 'multiselect';
  options?: { value: string; label: string; emoji?: string }[];
  placeholder?: string;
}

const PRESETS: Preset[] = [
  {
    id: 'assistant',
    name: 'Personal Assistant',
    emoji: '🦞',
    description: 'A helpful everyday assistant for tasks, reminders, and general questions',
    tagline: 'Your AI sidekick for daily life',
    defaultCapabilities: ['scheduling', 'reminders', 'research', 'writing'],
    gradient: 'linear-gradient(135deg, #e63946 0%, #ff6b6b 100%)',
    questions: [
      {
        id: 'name',
        question: "What should I call your assistant?",
        type: 'text',
        placeholder: 'e.g., Atlas, Friday, Jarvis...',
      },
      {
        id: 'tone',
        question: "How should your assistant communicate?",
        type: 'select',
        options: [
          { value: 'friendly', label: 'Friendly & Casual', emoji: '😊' },
          { value: 'professional', label: 'Professional & Formal', emoji: '👔' },
          { value: 'witty', label: 'Witty & Playful', emoji: '😄' },
          { value: 'concise', label: 'Brief & To-the-point', emoji: '⚡' },
        ],
      },
      {
        id: 'focus',
        question: "What will you use it for most?",
        type: 'multiselect',
        options: [
          { value: 'productivity', label: 'Productivity & Tasks', emoji: '✅' },
          { value: 'research', label: 'Research & Learning', emoji: '🔍' },
          { value: 'writing', label: 'Writing & Communication', emoji: '✍️' },
          { value: 'planning', label: 'Planning & Organization', emoji: '📅' },
          { value: 'ideas', label: 'Brainstorming Ideas', emoji: '💡' },
        ],
      },
    ],
  },
  {
    id: 'coder',
    name: 'Developer',
    emoji: '👨‍💻',
    description: 'Expert pair programmer for debugging, code review, and development help',
    tagline: 'Ship code faster together',
    defaultCapabilities: ['coding', 'debugging', 'architecture', 'code-review'],
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    questions: [
      {
        id: 'name',
        question: "Name your coding buddy",
        type: 'text',
        placeholder: 'e.g., Copilot, Dev, Byte...',
      },
      {
        id: 'languages',
        question: "What languages do you work with?",
        type: 'multiselect',
        options: [
          { value: 'javascript', label: 'JavaScript/TypeScript', emoji: '🟨' },
          { value: 'python', label: 'Python', emoji: '🐍' },
          { value: 'rust', label: 'Rust', emoji: '🦀' },
          { value: 'go', label: 'Go', emoji: '🐹' },
          { value: 'java', label: 'Java/Kotlin', emoji: '☕' },
          { value: 'swift', label: 'Swift', emoji: '🍎' },
          { value: 'csharp', label: 'C#/.NET', emoji: '🟣' },
          { value: 'other', label: 'Other', emoji: '💻' },
        ],
      },
      {
        id: 'style',
        question: "How should code explanations be?",
        type: 'select',
        options: [
          { value: 'detailed', label: 'Detailed with examples', emoji: '📚' },
          { value: 'concise', label: 'Concise and direct', emoji: '⚡' },
          { value: 'visual', label: 'With diagrams when helpful', emoji: '📊' },
          { value: 'socratic', label: 'Guide me to figure it out', emoji: '🤔' },
        ],
      },
    ],
  },
  {
    id: 'researcher',
    name: 'Research Analyst',
    emoji: '🔬',
    description: 'Deep researcher for analysis, fact-checking, and synthesizing information',
    tagline: 'Insights at the speed of thought',
    defaultCapabilities: ['research', 'analysis', 'summarization', 'fact-checking'],
    gradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
    questions: [
      {
        id: 'name',
        question: "Name your research assistant",
        type: 'text',
        placeholder: 'e.g., Scholar, Sage, Oracle...',
      },
      {
        id: 'domains',
        question: "What topics interest you most?",
        type: 'multiselect',
        options: [
          { value: 'tech', label: 'Technology & Science', emoji: '🔬' },
          { value: 'business', label: 'Business & Finance', emoji: '📈' },
          { value: 'health', label: 'Health & Medicine', emoji: '🏥' },
          { value: 'social', label: 'Social Sciences', emoji: '🌍' },
          { value: 'arts', label: 'Arts & Culture', emoji: '🎨' },
          { value: 'current', label: 'Current Events', emoji: '📰' },
        ],
      },
      {
        id: 'depth',
        question: "How deep should research go?",
        type: 'select',
        options: [
          { value: 'overview', label: 'Quick overviews first', emoji: '👀' },
          { value: 'balanced', label: 'Balanced depth', emoji: '⚖️' },
          { value: 'comprehensive', label: 'Always comprehensive', emoji: '📖' },
          { value: 'academic', label: 'Academic-level rigor', emoji: '🎓' },
        ],
      },
    ],
  },
  {
    id: 'creative',
    name: 'Creative Partner',
    emoji: '🎨',
    description: 'Brainstorming buddy for writing, ideation, and creative projects',
    tagline: 'Imagination amplified',
    defaultCapabilities: ['writing', 'brainstorming', 'storytelling', 'editing'],
    gradient: 'linear-gradient(135deg, #db2777 0%, #f472b6 100%)',
    questions: [
      {
        id: 'name',
        question: "Name your creative muse",
        type: 'text',
        placeholder: 'e.g., Muse, Spark, Luna...',
      },
      {
        id: 'creative_type',
        question: "What kind of creative work?",
        type: 'multiselect',
        options: [
          { value: 'fiction', label: 'Fiction & Stories', emoji: '📖' },
          { value: 'content', label: 'Content & Copywriting', emoji: '✍️' },
          { value: 'poetry', label: 'Poetry & Lyrics', emoji: '🎵' },
          { value: 'scripts', label: 'Scripts & Dialogue', emoji: '🎬' },
          { value: 'ideas', label: 'Idea Generation', emoji: '💡' },
          { value: 'editing', label: 'Editing & Feedback', emoji: '✨' },
        ],
      },
      {
        id: 'creative_style',
        question: "What's your creative vibe?",
        type: 'select',
        options: [
          { value: 'encouraging', label: 'Encouraging & supportive', emoji: '💪' },
          { value: 'challenging', label: 'Push me to be better', emoji: '🎯' },
          { value: 'collaborative', label: 'True collaborator', emoji: '🤝' },
          { value: 'wild', label: 'Wild and unexpected', emoji: '🚀' },
        ],
      },
    ],
  },
  {
    id: 'tutor',
    name: 'Learning Tutor',
    emoji: '📚',
    description: 'Patient teacher for explaining concepts and helping you learn new skills',
    tagline: 'Learn anything, anytime',
    defaultCapabilities: ['teaching', 'explanations', 'practice', 'quizzes'],
    gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    questions: [
      {
        id: 'name',
        question: "Name your tutor",
        type: 'text',
        placeholder: 'e.g., Professor, Mentor, Guide...',
      },
      {
        id: 'subjects',
        question: "What do you want to learn?",
        type: 'multiselect',
        options: [
          { value: 'programming', label: 'Programming', emoji: '💻' },
          { value: 'languages', label: 'Languages', emoji: '🗣️' },
          { value: 'math', label: 'Math & Logic', emoji: '🔢' },
          { value: 'science', label: 'Science', emoji: '🔬' },
          { value: 'business', label: 'Business Skills', emoji: '💼' },
          { value: 'creative', label: 'Creative Skills', emoji: '🎨' },
        ],
      },
      {
        id: 'learning_style',
        question: "How do you learn best?",
        type: 'select',
        options: [
          { value: 'examples', label: 'Show me examples', emoji: '👁️' },
          { value: 'explain', label: 'Explain concepts first', emoji: '📝' },
          { value: 'practice', label: 'Learn by doing', emoji: '🛠️' },
          { value: 'quiz', label: 'Test my knowledge', emoji: '❓' },
        ],
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Agent',
    emoji: '✨',
    description: 'Design your own unique AI assistant from scratch',
    tagline: 'Your vision, your rules',
    defaultCapabilities: [],
    gradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    questions: [
      {
        id: 'name',
        question: "What's your agent's name?",
        type: 'text',
        placeholder: 'Give your agent a name...',
      },
      {
        id: 'role',
        question: "What role should it play?",
        type: 'text',
        placeholder: 'e.g., Business strategist, Writing coach...',
      },
      {
        id: 'personality',
        question: "Describe its personality",
        type: 'text',
        placeholder: 'e.g., Friendly, analytical, with dry humor...',
      },
    ],
  },
];

type Step = 'persona' | 'questions' | 'complete';

export function AgentOnboarding({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>('persona');
  const [selectedPreset, setSelectedPreset] = useState<PersonaPreset | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const selectedPresetData = PRESETS.find(p => p.id === selectedPreset);
  const currentQuestion = selectedPresetData?.questions[currentQuestionIndex];
  const totalQuestions = selectedPresetData?.questions.length || 0;

  // Skip to complete if no questions exist for the preset
  useEffect(() => {
    if (step === 'questions' && selectedPresetData && totalQuestions === 0) {
      handleComplete();
    }
  }, [step, selectedPresetData, totalQuestions]);

  const handlePresetSelect = (preset: PersonaPreset) => {
    setSelectedPreset(preset);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setStep('questions');
  };

  const handleAnswer = (questionId: string, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else {
      setStep('persona');
    }
  };

  const canProceed = () => {
    if (!currentQuestion) return false;
    const answer = answers[currentQuestion.id];
    if (currentQuestion.type === 'multiselect') {
      return Array.isArray(answer) && answer.length > 0;
    }
    return typeof answer === 'string' && answer.trim().length > 0;
  };

  const toggleMultiSelect = (questionId: string, value: string) => {
    const current = (answers[questionId] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    handleAnswer(questionId, updated);
  };

  const handleComplete = async () => {
    try {
      const agentName = (answers['name'] as string) || selectedPresetData?.name || 'Assistant';
      await onComplete({
        persona: selectedPreset!,
        name: agentName,
        preferences: Object.fromEntries(
          Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
        ),
        capabilities: selectedPresetData?.defaultCapabilities || [],
      });
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  // Persona Selection Step
  if (step === 'persona') {
    return (
      <div className="onboarding">
        <div className="onboarding-content">
          <div className="onboarding-header">
            <div className="onboarding-icon-wrapper">
              <div className="onboarding-icon"><ClawBoxLogo size={40} /></div>
              <div className="onboarding-icon-rings" />
            </div>
            <h1>Create Your Agent</h1>
            <p className="onboarding-subtitle">
              Choose a starting point — we'll personalize it for you
            </p>
          </div>

          <div className="persona-grid">
            {PRESETS.map((preset, index) => (
              <button
                key={preset.id}
                className={`persona-card ${selectedPreset === preset.id ? 'selected' : ''}`}
                onClick={() => handlePresetSelect(preset.id)}
                style={{
                  '--card-gradient': preset.gradient,
                  '--animation-delay': `${index * 0.08}s`,
                } as React.CSSProperties}
              >
                <div className="persona-card-glow" />
                <div className="persona-emoji">{preset.emoji}</div>
                <div className="persona-name">{preset.name}</div>
                <div className="persona-tagline">{preset.tagline}</div>
              </button>
            ))}
          </div>

          <button className="skip-link" onClick={onSkip}>
            Skip for now — I'll set this up later
          </button>
        </div>
      </div>
    );
  }

  // Dynamic Questions Step
  if (step === 'questions' && currentQuestion) {
    const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

    return (
      <div className="onboarding">
        <div className="onboarding-content">
          {/* Progress indicator */}
          <div className="question-progress">
            <div className="progress-bar-mini">
              <div className="progress-fill-mini" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{currentQuestionIndex + 1} of {totalQuestions}</span>
          </div>

          <div className="question-container" key={currentQuestion.id}>
            <div className="question-emoji">{selectedPresetData?.emoji}</div>
            <h2 className="question-text">{currentQuestion.question}</h2>

            {currentQuestion.type === 'text' && (
              <div className="question-input-wrapper">
                <input
                  type="text"
                  className="question-input"
                  placeholder={currentQuestion.placeholder}
                  value={(answers[currentQuestion.id] as string) || ''}
                  onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && canProceed() && handleNextQuestion()}
                />
              </div>
            )}

            {currentQuestion.type === 'select' && (
              <div className="question-options">
                {currentQuestion.options?.map((option) => (
                  <button
                    key={option.value}
                    className={`option-card ${answers[currentQuestion.id] === option.value ? 'selected' : ''}`}
                    onClick={() => handleAnswer(currentQuestion.id, option.value)}
                  >
                    {option.emoji && <span className="option-emoji">{option.emoji}</span>}
                    <span className="option-label">{option.label}</span>
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'multiselect' && (
              <>
                <p className="multiselect-hint">Select all that apply</p>
                <div className="question-options multiselect">
                  {currentQuestion.options?.map((option) => {
                    const isSelected = ((answers[currentQuestion.id] as string[]) || []).includes(option.value);
                    return (
                      <button
                        key={option.value}
                        className={`option-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleMultiSelect(currentQuestion.id, option.value)}
                      >
                        {option.emoji && <span className="option-emoji">{option.emoji}</span>}
                        <span className="option-label">{option.label}</span>
                        {isSelected && <span className="option-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="onboarding-nav">
            <button className="btn-secondary" onClick={handlePrevQuestion}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleNextQuestion}
              disabled={!canProceed()}
            >
              {currentQuestionIndex === totalQuestions - 1 ? 'Continue' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No complete step - onComplete callback handles navigation to chat
  return null;
}
