// Firebase Storage access via firebase-admin. All bottle/map/producer-logo
// images live in the Firebase bucket set up with the project; the DB only
// stores the storage_path (a gs:// URL) and metadata, never the bytes.
import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminAuth } from "./firebase-admin";

// Re-export so route handlers that only need storage don't also pull in auth
// via a tangle of imports.
function bucket() {
  // Ensure firebase-admin is initialised (adminAuth() does the init).
  adminAuth();
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  return getStorage().bucket(name);
}

export async function uploadBytes(opts: {
  storagePath: string;          // e.g. "assets/originals/<asset_id>.jpg"
  bytes: Buffer | Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const file = bucket().file(opts.storagePath);
  await file.save(Buffer.from(opts.bytes), {
    contentType: opts.contentType,
    metadata: { metadata: opts.metadata ?? {} },
    resumable: false,
  });
}

export async function signedUrl(storagePath: string, ttlMinutes = 60): Promise<string> {
  const file = bucket().file(storagePath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + ttlMinutes * 60 * 1000,
  });
  return url;
}

export async function removeObject(storagePath: string): Promise<void> {
  try {
    await bucket().file(storagePath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.warn("[storage] delete failed", storagePath, err instanceof Error ? err.message : err);
  }
}

export function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET && process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}
