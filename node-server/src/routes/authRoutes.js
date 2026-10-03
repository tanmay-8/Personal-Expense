import express from "express";
import { getUserForSession, loginUser, logoutUser, registerUser } from "../services/authService.js";
import { SESSION_COOKIE } from "../middleware/auth.js";

const router = express.Router();
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" };

function handleError(res, error) {
  const clientError = /required|valid|password|exists|invalid/.test(error.message);
  return res.status(clientError ? 400 : 500).json({ error: error.message });
}

router.post("/register", async (req, res) => {
  try { const session = await registerUser(req.body); res.cookie(SESSION_COOKIE, session.token, cookieOptions).json({ user: session.user }); } catch (error) { handleError(res, error); }
});

router.post("/login", async (req, res) => {
  try { const session = await loginUser(req.body); res.cookie(SESSION_COOKIE, session.token, cookieOptions).json({ user: session.user }); } catch (error) { handleError(res, error); }
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = await getUserForSession(token);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ user });
});

router.post("/logout", async (req, res) => {
  await logoutUser(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }).status(204).end();
});

export default router;