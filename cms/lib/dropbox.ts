// Thin wrapper around the Dropbox v2 HTTP API.  No SDK — the three endpoints
// we use are straightforward REST so adding a dependency isn't worth it.
//
// Auth: DROPBOX_ACCESS_TOKEN env var (scoped access token with
// files.metadata.read + files.content.read).  App-folder apps see paths
// relative to /Apps/<app name>/; full-dropbox apps see absolute paths.
import "server-only";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export type DropboxEntry = {
  ".tag": "file" | "folder" | "deleted";
  id?: string;
  name: string;
  path_display?: string;    // e.g. "/Photos/foo.jpg"
  path_lower?: string;
  size?: number;            // files only
  server_modified?: string; // files only, ISO date
  client_modified?: string;
  content_hash?: string;    // Dropbox's own hash, not SHA-256
};

type ListResp = {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
};

export function dropboxConfigured(): boolean {
  return Boolean(process.env.DROPBOX_ACCESS_TOKEN);
}

function token(): string {
  const t = process.env.DROPBOX_ACCESS_TOKEN;
  if (!t) throw new Error("DROPBOX_ACCESS_TOKEN is not set.");
  return t;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dropbox ${url.split("/").pop()} ${res.status}: ${text.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export async function whoAmI(): Promise<{ email: string; name: string } | null> {
  try {
    const r = await post<{ email: string; name: { display_name: string } }>(
      `${API}/users/get_current_account`,
      null,
    );
    return { email: r.email, name: r.name.display_name };
  } catch {
    return null;
  }
}

// List one folder page.  `path` is "" for the root (app folder or home).
export async function listFolder(path: string, cursor?: string): Promise<ListResp> {
  if (cursor) {
    return post<ListResp>(`${API}/files/list_folder/continue`, { cursor });
  }
  return post<ListResp>(`${API}/files/list_folder`, {
    path: path === "" || path === "/" ? "" : path,
    recursive: false,
    include_media_info: false,
    include_deleted: false,
    include_mounted_folders: true,
    limit: 500,
  });
}

// Walk every page of a folder; use sparingly.
export async function listFolderAll(path: string): Promise<DropboxEntry[]> {
  let page = await listFolder(path);
  const all = [...page.entries];
  while (page.has_more) {
    page = await listFolder(path, page.cursor);
    all.push(...page.entries);
  }
  return all;
}

// Download a file's bytes.
export async function downloadFile(path: string): Promise<{ bytes: Buffer; name: string; contentType: string }> {
  const res = await fetch(`${CONTENT}/files/download`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token()}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dropbox download ${res.status}: ${text.slice(0, 400)}`);
  }
  // The API returns the file metadata as JSON in the Dropbox-API-Result header.
  const metaRaw = res.headers.get("dropbox-api-result");
  const meta = metaRaw ? (JSON.parse(metaRaw) as DropboxEntry) : null;
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytes: buf, name: meta?.name ?? path.split("/").pop() ?? "file", contentType };
}

export function guessImageContentType(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".avif")) return "image/avif";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
