// MD3 message surface with optional persona-colored fills.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NeonAvatar from './NeonAvatar';

function parseHexColor(color) {
  if (!color?.startsWith('#')) return null;
  const hex = color.slice(1);
  const normalized =
    hex.length === 3
      ? hex.split('').map((char) => char + char).join('')
      : hex;
  if (normalized.length !== 6) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastTextForBackground(backgroundColor) {
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) return undefined;
  return relativeLuminance(rgb) > 0.5 ? '#000000' : '#FFFFFF';
}

function LoadingDots() {
  return (
    <span className="neon-chat-loading" aria-label="Loading">
      <span aria-hidden>.</span>
      <span aria-hidden>.</span>
      <span aria-hidden>.</span>
    </span>
  );
}

export default function NeonChatBubble({
  side = 'Agent',
  senderName,
  content = '',
  loading = false,
  markdown = true,
  bubbleColor,
  textColor,
  personaSrc = '/neon-ai-persona.png',
  personaAlt = 'Co-Panel persona',
  avatarKind,
  avatarLabel,
  avatarColor,
  actions = null,
  headerExtra = null,
  nameExtra = null,
  footerExtra = null,
  rowClassName = '',
  rowProps = {},
  className = '',
  contentClassName = '',
  accentColor,
}) {
  const isUser = side === 'User';
  const rowModifier = isUser ? 'user' : 'assistant';
  const resolvedAvatarKind = avatarKind ?? (isUser ? 'user' : 'persona');
  const { className: rowPropsClassName, ...restRowProps } = rowProps;
  const accent = accentColor || avatarColor || bubbleColor;
  const resolvedTextColor =
    textColor ?? (bubbleColor ? contrastTextForBackground(bubbleColor) : undefined);

  const bubbleStyle = {
    ...(bubbleColor
      ? {
          '--neon-chat-bubble-bg': bubbleColor,
          '--md-chat-bubble-bg': bubbleColor,
          backgroundColor: bubbleColor,
        }
      : {}),
    ...(accent ? { '--md-chat-accent': accent } : {}),
    ...(resolvedTextColor
      ? {
          '--neon-chat-bubble-text': resolvedTextColor,
          '--md-chat-bubble-text': resolvedTextColor,
          color: resolvedTextColor,
        }
      : {}),
  };

  return (
    <div
      className={[
        'neon-chat-row',
        `neon-chat-row--${rowModifier}`,
        'md-chat-row',
        bubbleColor ? 'md-chat-row--tinted' : '',
        className,
        rowClassName,
        rowPropsClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      {...restRowProps}
    >
      {!isUser && (
        <NeonAvatar
          kind={resolvedAvatarKind}
          personaSrc={personaSrc}
          personaAlt={personaAlt}
          label={avatarLabel}
          backgroundColor={avatarColor}
        />
      )}
      <div className="neon-chat-bubble-wrap md-chat-bubble-wrap">
        {senderName && (
          <div className="neon-chat-bubble-name md-chat-bubble-name">
            <span>{senderName}</span>
            {nameExtra}
          </div>
        )}
        <div
          className={`neon-chat-bubble neon-chat-bubble--${rowModifier} md-chat-bubble md-chat-bubble--${rowModifier}${bubbleColor ? ' md-chat-bubble--colored' : ''}`}
          style={Object.keys(bubbleStyle).length > 0 ? bubbleStyle : undefined}
        >
          {headerExtra}
          {loading && !content ? (
            <LoadingDots />
          ) : markdown ? (
            <div className={['neon-chat-bubble-md', 'md-chat-bubble-body', contentClassName].filter(Boolean).join(' ')}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className={['md-chat-bubble-body', contentClassName].filter(Boolean).join(' ')}>
              {content}
            </div>
          )}
          {footerExtra}
        </div>
        {!isUser && actions}
      </div>
      {isUser && (
        <NeonAvatar
          kind={resolvedAvatarKind}
          label={avatarLabel}
          backgroundColor={avatarColor}
        />
      )}
    </div>
  );
}
