import express from "express";
import {
  createExpense, createTrip, deleteExpense, deleteTrip, EXPENSE_CATEGORIES,
  getDashboard, listExpenses, listTrips, PAYMENT_METHODS, updateExpense, updateTrip,
} from "../services/expenseService.js";

const router = express.Router();

function handleError(res, error) {
  const clientError = /required|invalid|greater|cannot|not found|zero/.test(error.message);
  return res.status(clientError ? 400 : 500).json({ error: error.message });
}

router.get("/meta", (req, res) => res.json({ categories: EXPENSE_CATEGORIES, paymentMethods: PAYMENT_METHODS }));

router.post("/expenses", async (req, res) => {
  try { res.status(201).json(await createExpense(req.body)); } catch (error) { handleError(res, error); }
});

router.get("/expenses", async (req, res) => {
  try { res.json(await listExpenses(req.query)); } catch (error) { handleError(res, error); }
});

router.put("/expenses/:id", async (req, res) => {
  try { res.json(await updateExpense(req.params.id, req.body)); } catch (error) { handleError(res, error); }
});

router.delete("/expenses/:id", async (req, res) => {
  try { await deleteExpense(req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); }
});

router.get("/dashboard", async (req, res) => {
  try { res.json(await getDashboard(req.query.month || new Date().toISOString().slice(0, 7))); } catch (error) { handleError(res, error); }
});

router.get("/trips", async (req, res) => {
  try { res.json(await listTrips()); } catch (error) { handleError(res, error); }
});

router.post("/trips", async (req, res) => {
  try { res.status(201).json(await createTrip(req.body)); } catch (error) { handleError(res, error); }
});

router.put("/trips/:id", async (req, res) => {
  try { res.json(await updateTrip(req.params.id, req.body)); } catch (error) { handleError(res, error); }
});

router.delete("/trips/:id", async (req, res) => {
  try { await deleteTrip(req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); }
});

router.post("/add-expense", async (req, res) => {
  try {
    res.json({ message: "Expense added", expense: await createExpense(req.body) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/month-expenses", async (req, res) => {
  try {
    const data = await getDashboard(new Date().toISOString().slice(0, 7));
    res.json({ ...data, expenses: data.expenses.map((expense) => ({ ...expense, expense: expense.amount })) });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;