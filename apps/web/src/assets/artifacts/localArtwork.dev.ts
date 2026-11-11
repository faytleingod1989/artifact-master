export const localArtworkByPath = import.meta.glob('./originals/**/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
