import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { models, prepareDocument } from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackPath = path.resolve(__dirname, '../../data/store.json');
const collections = Object.keys(models);

let firebaseApp = null;
let firestoreDb = null;
let firestoreReady = false;
let fallback = Object.fromEntries(collections.map((name) => [name, []]));
let writeQueue = Promise.resolve();

const normalize = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      if (key === '_id') out.id = String(entry);
      else if (key !== '__v') out[key] = normalize(entry);
    }
    return out;
  }
  return value;
};

function persistFallback() {
  const snapshot = JSON.stringify(fallback, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, snapshot);
  });
  return writeQueue;
}

export function isFirebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  );
}

async function resolveFirebaseOptions() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return { projectId: process.env.FIREBASE_PROJECT_ID || 'minegov-ai' };
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(jsonText);
    return {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
    };
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const fullPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const contents = await fs.readFile(fullPath, 'utf8');
    const serviceAccount = JSON.parse(contents);
    return {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
    };
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    };
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    };
  }
  return null;
}

// Explicit opt-in for demo/preview deployments that intentionally run without
// Firebase Firestore. Never enable this for a real operational deployment.
const allowLocalDemoStore = process.env.ALLOW_LOCAL_DEMO_STORE === 'true';

export async function connectDatabase() {
  if (process.env.NODE_ENV === 'production' && !isFirebaseConfigured() && !allowLocalDemoStore) {
    throw new Error('Firebase Firestore credentials are required in production (or set ALLOW_LOCAL_DEMO_STORE=true for an intentional demo deployment).');
  }
  if (process.env.NODE_ENV === 'production' && !isFirebaseConfigured() && allowLocalDemoStore) {
    console.warn('⚠ ALLOW_LOCAL_DEMO_STORE=true: running in production without Firebase Firestore. Use a Firebase project for any real data.');
  }
  if (isFirebaseConfigured()) {
    try {
      const options = await resolveFirebaseOptions();
      const existingApps = getApps();
      firebaseApp = existingApps.length ? existingApps[0] : initializeApp(options);
      firestoreDb = getFirestore(firebaseApp);
      try {
        firestoreDb.settings({ ignoreUndefinedProperties: true });
      } catch {
        // Firestore settings already applied on this instance
      }
      await Promise.race([
        firestoreDb.collection('mines').limit(1).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore connection timed out after 5000ms')), 5000)),
      ]);
      firestoreReady = true;
      console.log('✓ Connected to Firebase Firestore');
      return 'firebase';
    } catch (error) {
      if (process.env.NODE_ENV === 'production' && !allowLocalDemoStore) {
        throw new Error(`Firebase Firestore connection failed: ${error.message}`);
      }
      console.warn(`Firebase Firestore unavailable (${error.message}). Using the local JSON development store.`);
    }
  } else {
    console.warn('Firebase credentials are not set. Using the local JSON development store. Configure Firebase Firestore for deployment.');
  }
  try {
    const contents = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(contents);
    for (const name of collections) fallback[name] = Array.isArray(parsed[name]) ? parsed[name] : [];
  } catch {
    await persistFallback();
  }
  return 'json';
}

export function databaseMode() {
  return firestoreReady ? 'firebase' : 'json';
}

export function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function assertCollection(collection) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
}

export async function list(collection) {
  assertCollection(collection);
  if (firestoreReady) {
    const snapshot = await firestoreDb.collection(collection).get();
    return snapshot.docs.map((doc) => normalize({ id: doc.id, ...doc.data() }));
  }
  return structuredClone(fallback[collection]).map(normalize);
}

export async function get(collection, id) {
  assertCollection(collection);
  if (!id) return null;
  const docId = String(id);
  if (firestoreReady) {
    const doc = await firestoreDb.collection(collection).doc(docId).get();
    return doc.exists ? normalize({ id: doc.id, ...doc.data() }) : null;
  }
  const found = fallback[collection].find((item) => String(item.id) === docId) || null;
  return found ? structuredClone(normalize(found)) : null;
}

export async function findOne(collection, predicate) {
  const items = await list(collection);
  return items.find(predicate) || null;
}

export async function create(collection, values) {
  assertCollection(collection);
  const now = new Date().toISOString();
  const prepared = prepareDocument(collection, values, { isUpdate: false });
  const id = String(prepared.id || values?.id || newId());
  const item = normalize({
    ...prepared,
    id,
    createdAt: prepared.createdAt || now,
    updatedAt: prepared.updatedAt || now,
  });
  if (firestoreReady) {
    const { id: docId, ...docData } = item;
    await firestoreDb.collection(collection).doc(docId).set(docData);
    return item;
  }
  fallback[collection].push(item);
  await persistFallback();
  return structuredClone(item);
}

export async function update(collection, id, values) {
  assertCollection(collection);
  if (!id) return null;
  const docId = String(id);
  const prepared = prepareDocument(collection, values, { isUpdate: true });
  delete prepared.id;
  const now = new Date().toISOString();
  if (firestoreReady) {
    const ref = firestoreDb.collection(collection).doc(docId);
    const existing = await ref.get();
    if (!existing.exists) return null;
    const updates = normalize({ ...prepared, updatedAt: now });
    await ref.set(updates, { merge: true });
    return normalize({ id: docId, ...existing.data(), ...updates });
  }
  const index = fallback[collection].findIndex((item) => String(item.id) === docId);
  if (index === -1) return null;
  fallback[collection][index] = normalize({
    ...fallback[collection][index],
    ...prepared,
    id: fallback[collection][index].id,
    updatedAt: now,
  });
  await persistFallback();
  return structuredClone(fallback[collection][index]);
}

export async function remove(collection, id) {
  assertCollection(collection);
  if (!id) return null;
  const docId = String(id);
  if (firestoreReady) {
    const ref = firestoreDb.collection(collection).doc(docId);
    const existing = await ref.get();
    if (!existing.exists) return null;
    const deleted = normalize({ id: docId, ...existing.data() });
    await ref.delete();
    return deleted;
  }
  const index = fallback[collection].findIndex((item) => String(item.id) === docId);
  if (index === -1) return null;
  const [deleted] = fallback[collection].splice(index, 1);
  await persistFallback();
  return structuredClone(deleted);
}

export async function closeDatabase() {
  if (firebaseApp) {
    await deleteApp(firebaseApp);
    firebaseApp = null;
    firestoreDb = null;
    firestoreReady = false;
  }
}
