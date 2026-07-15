// Vendored from neon-design@dev-cursor — final/components/NeonAvatar.jsx
import { User } from 'lucide-react';

export default function NeonAvatar({
  kind = 'persona',
  size = 'md',
  personaSrc = '/neon-ai-persona.png',
  personaAlt = 'Co-Panel persona',
  label = '',
  backgroundColor,
  className = '',
}) {
  if (kind === 'user') {
    return (
      <div
        className={`neon-avatar neon-avatar--${size} neon-avatar--user${className ? ` ${className}` : ''}`}
        role="img"
        aria-label="You"
      >
        <User size={size === 'sm' ? 14 : 20} aria-hidden />
      </div>
    );
  }

  if (kind === 'initial') {
    return (
      <div
        className={`neon-avatar neon-avatar--${size} neon-avatar--initial${className ? ` ${className}` : ''}`}
        style={backgroundColor ? { background: backgroundColor } : undefined}
        role="img"
        aria-label={label || 'Participant'}
      >
        <span className="neon-avatar__initial" aria-hidden>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`neon-avatar neon-avatar--${size} neon-avatar--persona${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={personaAlt}
    >
      <img src={personaSrc} alt="" className="neon-avatar__img" />
    </div>
  );
}
