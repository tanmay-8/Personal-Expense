import express from "express";
import {
  createCategory, createExpense, createRecurring, createTrip, deleteCategory, deleteExpense,
  deleteRecurring, deleteTrip, generateRecurringExpenses, getDashboard, listCategories,
  listExpenses, listRecurring, listTrips, PAYMENT_METHODS, updateCategory, updateExpense,
  updateRecurring, updateTrip,
} from "../services/expenseService.js";

const router = express.Router();

function handleError(res, error) {
  const clientError = /required|invalid|greater|cannot|not found|zero/.test(error.message);
  return res.status(clientError ? 400 : 500).json({ error: error.message });
}

router.get("/meta", async (req, res) => { try { const categories = await listCategories(); res.json({ categories: categories.map((category) => category.name), categoryDetails: categories, paymentMethods: PAYMENT_METHODS }); } catch (error) { handleError(res, error); } });

router.get("/categories", async (req, res) => { try { res.json(await listCategories(req.query.includeHidden === "true")); } catch (error) { handleError(res, error); } });
router.post("/categories", async (req, res) => { try { res.status(201).json(await createCategory(req.body)); } catch (error) { handleError(res, error); } });
router.put("/categories/:id", async (req, res) => { try { res.json(await updateCategory(req.params.id, req.body)); } catch (error) { handleError(res, error); } });
router.delete("/categories/:id", async (req, res) => { try { await deleteCategory(req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); } });

router.get("/recurring", async (req, res) => { try { res.json(await listRecurring()); } catch (error) { handleError(res, error); } });
router.post("/recurring", async (req, res) => { try { res.status(201).json(await createRecurring(req.body)); } catch (error) { handleError(res, error); } });
router.put("/recurring/:id", async (req, res) => { try { res.json(await updateRecurring(req.params.id, req.body)); } catch (error) { handleError(res, error); } });
router.delete("/recurring/:id", async (req, res) => { try { await deleteRecurring(req.params.id); res.status(204).end(); } catch (error) { handleError(res, error); } });
router.post("/recurring/generate", async (req, res) => { try { res.json(await generateRecurringExpenses()); } catch (error) { handleError(res, error); } });

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