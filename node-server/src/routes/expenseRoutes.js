import express from "express";
import {
  createCategory, createExpense, createMoneyLent, createRecurring, createTrip, deleteCategory, deleteExpense,
  deleteMoneyLent,
  deleteRecurring, deleteTrip, generateRecurringExpenses, getDashboard, listCategories,
  listExpenses, listMoneyLent, listRecurring, listTrips, markMoneyCollected, PAYMENT_METHODS, updateCategory, updateExpense,
  updateMoneyLent,
  updateRecurring, updateTrip,
} from "../services/expenseService.js";

const router = express.Router();

function handleError(res, error) {
  const clientError = /required|invalid|greater|cannot|not found|zero/.test(error.message);
  return res.status(clientError ? 400 : 500).json({ error: error.message });
}

router.get("/meta", async (req, res) => { try { const categories = await listCategories(req.userId); res.json({ categories: categories.map((category) => category.name), categoryDetails: categories, paymentMethods: PAYMENT_METHODS }); } catch (error) { handleError(res, error); } });

router.get("/categories", async (req, res) => { try { res.json(await listCategories(req.userId, req.query.includeHidden === "true")); } catch (error) { handleError(res, error); } });
router.post("/categories", async (req, res) => { try { res.status(201).json(await createCategory(req.userId, req.body)); } catch (error) { handleError(res, error); } });
router.put("/categories/:id", async (req, res) => { try { res.json(await updateCategory(req.userId, req.params.id, req.body)); } catch (error) { handleError(res, error); } });
router.delete("/categories/:id", async (req, res) => { try { await deleteCategory(req.userId, req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); } });

router.get("/recurring", async (req, res) => { try { res.json(await listRecurring(req.userId)); } catch (error) { handleError(res, error); } });
router.post("/recurring", async (req, res) => { try { res.status(201).json(await createRecurring(req.userId, req.body)); } catch (error) { handleError(res, error); } });
router.put("/recurring/:id", async (req, res) => { try { res.json(await updateRecurring(req.userId, req.params.id, req.body)); } catch (error) { handleError(res, error); } });
router.delete("/recurring/:id", async (req, res) => { try { await deleteRecurring(req.userId, req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); } });
router.post("/recurring/generate", async (req, res) => { try { res.json(await generateRecurringExpenses(req.userId)); } catch (error) { handleError(res, error); } });

router.get("/money-lent", async (req, res) => { try { res.json(await listMoneyLent(req.userId, req.query)); } catch (error) { handleError(res, error); } });
router.post("/money-lent", async (req, res) => { try { res.status(201).json(await createMoneyLent(req.userId, req.body)); } catch (error) { handleError(res, error); } });
router.put("/money-lent/:id", async (req, res) => { try { res.json(await updateMoneyLent(req.userId, req.params.id, req.body)); } catch (error) { handleError(res, error); } });
router.post("/money-lent/:id/collect", async (req, res) => { try { res.json(await markMoneyCollected(req.userId, req.params.id)); } catch (error) { handleError(res, error); } });
router.delete("/money-lent/:id", async (req, res) => { try { await deleteMoneyLent(req.userId, req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); } });

router.post("/expenses", async (req, res) => {
  try { res.status(201).json(await createExpense(req.userId, req.body)); } catch (error) { handleError(res, error); }
});

router.get("/expenses", async (req, res) => {
  try { res.json(await listExpenses(req.userId, req.query)); } catch (error) { handleError(res, error); }
});

router.put("/expenses/:id", async (req, res) => {
  try { res.json(await updateExpense(req.userId, req.params.id, req.body)); } catch (error) { handleError(res, error); }
});

router.delete("/expenses/:id", async (req, res) => {
  try { await deleteExpense(req.userId, req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); }
});

router.get("/dashboard", async (req, res) => {
  try { res.json(await getDashboard(req.userId, req.query.month || new Date().toISOString().slice(0, 7))); } catch (error) { handleError(res, error); }
});

router.get("/trips", async (req, res) => {
  try { res.json(await listTrips(req.userId)); } catch (error) { handleError(res, error); }
});

router.post("/trips", async (req, res) => {
  try { res.status(201).json(await createTrip(req.userId, req.body)); } catch (error) { handleError(res, error); }
});

router.put("/trips/:id", async (req, res) => {
  try { res.json(await updateTrip(req.userId, req.params.id, req.body)); } catch (error) { handleError(res, error); }
});

router.delete("/trips/:id", async (req, res) => {
  try { await deleteTrip(req.userId, req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); }
});

router.post("/add-expense", async (req, res) => {
  try {
    res.json({ message: "Expense added", expense: await createExpense(req.userId, req.body) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/month-expenses", async (req, res) => {
  try {
    const data = await getDashboard(req.userId, new Date().toISOString().slice(0, 7));
    res.json({ ...data, expenses: data.expenses.map((expense) => ({ ...expense, expense: expense.amount })) });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;