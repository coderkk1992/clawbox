import { useState } from 'react';
import { ALL_PIXEL_CHARACTERS } from './PixelCharacters';

export interface Agent {
  id: string;
  name: string;
  persona: string;
  avatar: string;
  preferences: Record<string, string>;
  capabilities: string[];
  channels: string[];
  created_at: number;
}

interface Props {
  agents: Agent[];
  activeAgentId: string | null;
  onSelectAgent: (agent: Agent) => void;
  onCreateAgent: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AgentSidebar({
  agents,
  activeAgentId,
  onSelectAgent,
  onCreateAgent,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getAvatarComponent = (avatar: string) => {
    const character = ALL_PIXEL_CHARACTERS.find(c => c.id === avatar);
    if (character) {
      const Component = character.component;
      return <Component size={collapsed ? 32 : 40} />;
    }
    // Fallback to lobster
    const lobster = ALL_PIXEL_CHARACTERS[0];
    const FallbackComponent = lobster.component;
    return <FallbackComponent size={collapsed ? 32 : 40} />;
  };

  return (
    <div className={`agent-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="agent-sidebar-list">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-sidebar-item ${activeAgentId === agent.id ? 'active' : ''}`}
            onClick={() => onSelectAgent(agent)}
            onMouseEnter={() => setHoveredId(agent.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={agent.name}
          >
            <div className="agent-sidebar-avatar">
              {getAvatarComponent(agent.avatar)}
            </div>
            {!collapsed && (
              <span className="agent-sidebar-name">{agent.name}</span>
            )}
            {(hoveredId === agent.id || activeAgentId === agent.id) && !collapsed && (
              <div className="agent-sidebar-indicator" />
            )}
          </button>
        ))}
      </div>

      <div className="agent-sidebar-actions">
        <button
          className="agent-sidebar-add"
          onClick={onCreateAgent}
          title="Create new agent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && <span>New Agent</span>}
        </button>

        {onToggleCollapse && (
          <button
            className="agent-sidebar-collapse"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
