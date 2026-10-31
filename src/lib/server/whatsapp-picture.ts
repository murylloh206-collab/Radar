export function safeWhatsAppPictureUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted = host === 'whatsapp.net' || host.endsWith('.whatsapp.net') ||
      host === 'whatsapp.com' || host.endsWith('.whatsapp.com');
    return url.protocol === 'https:' && trusted && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
