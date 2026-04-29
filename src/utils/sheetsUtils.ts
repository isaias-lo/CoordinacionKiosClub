export async function sheetsWrite(url: string, rows: unknown[]): Promise<boolean> {
  if (!url) return false;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', rows }),
    });
    return true;
  } catch (e) {
    console.error('Sheets write error:', e);
    return false;
  }
}

export async function sheetsRead(url: string): Promise<unknown[]> {
  if (!url) return [];
  try {
    const res = await fetch(url + '?action=read');
    const json = await res.json();
    return (json as { rows?: unknown[] }).rows || [];
  } catch {
    return [];
  }
}
