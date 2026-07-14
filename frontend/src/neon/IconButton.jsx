// Vendored from neon-design@dev-cursor — final/components/IconButton.jsx
import './neon-material.register.js';

function resolveTag({ outline, filled }) {
  if (filled) return 'md-filled-icon-button';
  if (outline) return 'md-outlined-icon-button';
  return 'md-filled-tonal-icon-button';
}

export default function IconButton({
  label,
  outline = false,
  filled = false,
  ghost = false,
  className = '',
  children,
  ...props
}) {
  const Tag = resolveTag({ outline, filled });
  const isElevated = !outline && !filled && !ghost;
  const classes = [
    isElevated ? 'md-icon-button--elevated' : '',
    ghost ? 'md-icon-button--ghost' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="md-icon-button-host">
      <Tag aria-label={label} className={classes || undefined} {...props}>
        {children}
      </Tag>
    </span>
  );
}
