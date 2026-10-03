import crypto from "node:crypto";
import { getDatabase } from "../config/database.js";
import { seedInitialCategories } from "./expenseService.js";

const SESSION_DAYS = 30;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password, storedHash) {
  const [salt, expected] = String(storedHash).split(":");
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return expected && crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

async function authCollections() {
  const db = await getDatabase();
  return { users: db.collection("users"), sessions: db.collection("sessions") };
}

export async function initializeAuthDatabase() {
  const { users, sessions } = await authCollections();
  await users.createIndex({ email: 1 }, { unique: true });
  await sessions.createIndex({ token: 1 }, { unique: true });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export async function registerUser(input) {
  const name = String(input.name || "").trim().slice(0, 80);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  if (!name) throw new Error("Name is required");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const { users } = await authCollections();
  try {
    const now = new Date();
    const result = await users.insertOne({ name, email, passwordHash: hashPassword(password), createdAt: now, updatedAt: now });
    const userId = result.insertedId.toString();
    await seedInitialCategories(userId);
    return createSession(result.insertedId);
  } catch (error) {
    if (error.code === 11000) throw new Error("An account with this email already exists");
    throw error;
  }
}

export async function loginUser(input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const { users } = await authCollections();
  const user = await users.findOne({ email });
  if (!user || !passwordMatches(password, user.passwordHash)) throw new Error("Invalid email or password");
  return createSession(user._id);
}

export async function createSession(userId) {
  const { sessions, users } = await authCollections();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sessions.insertOne({ token, userId, expiresAt, createdAt: new Date() });
  const user = await users.findOne({ _id: userId });
  return { token, user: publicUser(user), expiresAt };
}

export async function getUserForSession(token) {
  if (!token) return null;
  const { sessions, users } = await authCollections();
  const session = await sessions.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId });
  return user ? publicUser(user) : null;
}

export async function logoutUser(token) {
  if (!token) return;
  const { sessions } = await authCollections();
  await sessions.deleteOne({ token });
}