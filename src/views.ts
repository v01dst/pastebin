const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0d1117; color: #e6edf3; }
  a { color: #7ee787; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 1.4rem; border-bottom: 1px solid #21262d; padding-bottom: 12px; }
  textarea, pre { width: 100%; background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 8px; padding: 14px; font-size: 14px; }
  textarea { min-height: 220px; resize: vertical; }
  pre { white-space: pre-wrap; word-break: break-word; }
  label { display: block; margin: 14px 0 6px; color: #8b949e; font-size: 13px; }
  select, input { background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; }
  button { background: #238636; color: #fff; border: 0; border-radius: 6px; padding: 10px 18px; font-size: 14px; cursor: pointer; margin-top: 16px; }
  button:hover { background: #2ea043; }
  .meta { color: #8b949e; font-size: 13px; margin: 10px 0; }
  .warn { color: #f0883e; font-size: 13px; }
  .url { font-size: 15px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; margin-top: 14px; word-break: break-all; }
</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

export function homePage(baseUrl: string): string {
  return page(
    "pastebin — new paste",
    `
<h1>📝 pastebin</h1>
<form method="post" action="/paste">
  <label for="content">Content</label>
  <textarea id="content" name="content" placeholder="paste anything…" required></textarea>
  <label for="language">Language (optional)</label>
  <input id="language" name="language" placeholder="typescript, go, text…">
  <label for="ttl">Expires in</label>
  <select id="ttl" name="ttl">
    <option value="">never</option>
    <option value="3600">1 hour</option>
    <option value="86400">1 day</option>
    <option value="604800">1 week</option>
    <option value="2592000">30 days</option>
  </select>
  <label>
    <input type="checkbox" name="burn" value="1" style="margin-right:6px">Burn after read
  </label>
  <div class="warn">Burn-after-read pastes are destroyed the moment they are viewed once.</div>
  <button type="submit">Create paste</button>
</form>
<p class="meta">API: <code>POST /paste</code> · <code>GET /paste/:id/raw</code> · served from ${escapeHtml(baseUrl)}</p>`
  );
}

export function createdPage(meta: { url: string; burnAfterRead: boolean; expiresAt: string | null }): string {
  return page(
    "pastebin — paste created",
    `
<h1>✅ Paste created</h1>
<p>Your link:</p>
<div class="url"><a href="${escapeHtml(meta.url)}">${escapeHtml(meta.url)}</a></div>
${meta.burnAfterRead ? '<p class="warn">🔥 This paste self-destructs after the first view.</p>' : ""}
${meta.expiresAt ? `<p class="meta">Expires: ${escapeHtml(meta.expiresAt)}</p>` : ""}`
  );
}

export function viewPastePage(p: { id: string; content: string; language: string | null; remainingViews: number | null; expiresAt: string | null }): string {
  return page(
    `pastebin — ${p.id}`,
    `
<h1>📄 paste ${escapeHtml(p.id)}</h1>
<p class="meta">${p.language ? `language: ${escapeHtml(p.language)} · ` : ""}${
    p.expiresAt ? `expires: ${escapeHtml(p.expiresAt)} · ` : ""
  }${p.remainingViews !== null ? `views left: ${p.remainingViews}` : "never expires"}</p>
<pre>${escapeHtml(p.content)}</pre>
<p><a href="/paste/${escapeHtml(p.id)}/raw">raw</a></p>`
  );
}

export function errorPage(code: number, message: string): string {
  return page(`pastebin — error ${code}`, `<h1>⚠️ ${code}</h1><p>${escapeHtml(message)}</p><p><a href="/">← new paste</a></p>`);
}
