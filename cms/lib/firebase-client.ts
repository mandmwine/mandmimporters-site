"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseClientConfigured = Boolean(config.apiKey && config.projectId);

let auth: Auth | null = null;

// The browser never keeps Firebase credentials: the server issues an HTTP-only
// session cookie, so in-memory persistence is enough.
export function clientAuth(): Auth {
  if (auth) return auth;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  return auth;
}
