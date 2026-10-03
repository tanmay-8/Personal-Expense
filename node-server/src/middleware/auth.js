import { getUserForSession } from "../services/authService.js";

export const SESSION_COOKIE = "expense_session";

export async function requireAuth(req, res, next) {
  try {
    const user = await getUserForSession(req.cookies?.[SESSION_COOKIE]);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    req.userId = user.id;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}