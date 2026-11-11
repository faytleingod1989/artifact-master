export const localPortraitsByPath = import.meta.glob('./originals/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>
