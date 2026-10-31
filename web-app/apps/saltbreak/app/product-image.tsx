export function ProductImage({
  src,
  alt,
  className,
  fit = 'contain',
}: {
  src: string;
  alt: string;
  className?: string;
  fit?: 'contain' | 'cover';
}) {
  if (!src) return <div className={`bg-neutral-100 ${className ?? ''}`} aria-label="No image" />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`bg-neutral-100 ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className ?? ''}`}
    />
  );
}
