import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { models } from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackPath = path.resolve(__dirname, '../../data/store.json');
const collections = Object.keys(models);
let mongoReady = false;
let fallback = Object.fromEntries(collections.map((name) => [name, []]));
let writeQueue = Promise.resolve();

const normalize = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId') return value.toString();
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
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

export async function connectDatabase() {
  if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) throw new Error('MONGO_URI is required in production.');
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      mongoReady = true;
      console.log('✓ Connected to MongoDB');
      return 'mongodb';
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw new Error(`MongoDB connection failed: ${error.message}`);
      console.warn(`MongoDB unavailable (${error.message}). Using the local JSON development store.`);
    }
  } else {
    console.warn('MONGO_URI is not set. Using the local JSON development store. Configure MongoDB for deployment.');
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

export function databaseMode() { return mongoReady ? 'mongodb' : 'json'; }
export function newId() { return new mongoose.Types.ObjectId().toString(); }

export async function list(collection) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  if (mongoReady) return (await models[collection].find({}).lean()).map(normalize);
  return structuredClone(fallback[collection]);
}

export async function get(collection, id) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  if (mongoReady) {
    if (!mongoose.isValidObjectId(id)) return null;
    const item = await models[collection].findById(id).lean();
    return item ? normalize(item) : null;
  }
  return structuredClone(fallback[collection].find((item) => String(item.id) === String(id)) || null);
}

export async function findOne(collection, predicate) {
  const items = await list(collection);
  return items.find(predicate) || null;
}

export async function create(collection, values) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  const data = { ...values };
  if (mongoReady) {
    const id = data.id;
    delete data.id;
    const created = await models[collection].create(id ? { ...data, _id: id } : data);
    return normalize(created.toObject());
  }
  const now = new Date().toISOString();
  const item = { ...data, id: data.id || newId(), createdAt: data.createdAt || now, updatedAt: data.updatedAt || now };
  fallback[collection].push(item);
  await persistFallback();
  return structuredClone(item);
}

export async function update(collection, id, values) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  if (mongoReady) {
    if (!mongoose.isValidObjectId(id)) return null;
    const updated = await models[collection].findByIdAndUpdate(id, { $set: values }, { new: true, runValidators: true }).lean();
    return updated ? normalize(updated) : null;
  }
  const index = fallback[collection].findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  fallback[collection][index] = { ...fallback[collection][index], ...values, id: fallback[collection][index].id, updatedAt: new Date().toISOString() };
  await persistFallback();
  return structuredClone(fallback[collection][index]);
}

export async function remove(collection, id) {
  if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  if (mongoReady) {
    if (!mongoose.isValidObjectId(id)) return null;
    const deleted = await models[collection].findByIdAndDelete(id).lean();
    return deleted ? normalize(deleted) : null;
  }
  const index = fallback[collection].findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  const [deleted] = fallback[collection].splice(index, 1);
  await persistFallback();
  return structuredClone(deleted);
}

export async function closeDatabase() {
  if (mongoReady) await mongoose.disconnect();
}
