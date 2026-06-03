export default function CustomerAvatar({ name, photo, size = 'md', className = '' }) {
  const getInitials = (n) =>
    n
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CL';

  const sizeClass = size === 'lg' ? 'customer-avatar--lg' : '';

  if (photo) {
    return (
      <div
        className={`customer-avatar ${sizeClass} ${className}`.trim()}
        aria-label={`${name} profile photo`}
      >
        <img src={photo} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div
      className={`customer-avatar customer-avatar--initials ${sizeClass} ${className}`.trim()}
      aria-label={`${name} avatar`}
      title={name}
    >
      <span>{getInitials(name)}</span>
    </div>
  );
}
