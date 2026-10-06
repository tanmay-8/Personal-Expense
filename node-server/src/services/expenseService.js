import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.js";

export const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Bank transfer", "Other"];
export const INITIAL_CATEGORIES = [
  ["Food", "🍽️", "#e5735b"], ["Commute", "🚗", "#5b8def"], ["Utilities", "💡", "#e6a23c"],
  ["Shopping", "🛍️", "#b46ee8"], ["Rent", "🏠", "#4c9f70"], ["Entertainment", "🎬", "#e06c9f"],
  ["Travel", "✈️", "#49a6a6"], ["Health", "❤", "#d85b66"], ["Subscription", "↻", "#7c83d4"],
  ["Home", "⌂", "#8b7565"], ["Other", "•", "#718096"],
];

function dateIsValid(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function toId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function ownerId(value) {
  const id = toId(value);
  if (!id) throw new Error("Invalid user id");
  return id;
}

async function cleanExpense(input, userId) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.date)) throw new Error("A valid date is required");
  const { categories } = await collections();
  if (!(await categories.findOne({ userId, name: input.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
  return {
    amount: Math.round(amount * 100) / 100,
    date: input.date,
    category: input.category,
    description: String(input.description || "").trim().slice(0, 240),
    paymentMethod: PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : "Other",
    tripId: input.tripId && toId(input.tripId) ? toId(input.tripId) : null,
  };
}

function cleanTrip(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  if (!name) throw new Error("Trip name is required");
  if (!dateIsValid(input.startDate) || !dateIsValid(input.endDate)) throw new Error("Valid trip dates are required");
  if (input.endDate < input.startDate) throw new Error("Trip end date cannot be before its start date");
  const budget = input.budget === "" || input.budget == null ? null : Number(input.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error("Trip budget must be zero or more");
  return { name, destination: String(input.destination || "").trim().slice(0, 120), startDate: input.startDate, endDate: input.endDate, budget, notes: String(input.notes || "").trim().slice(0, 500) };
}

async function collections() {
  const db = await getDatabase();
  return {
    expenses: db.collection("expenses"),
    trips: db.collection("trips"),
    categories: db.collection("categories"),
    recurring: db.collection("recurringExpenses"),
    lent: db.collection("moneyLent"),
  };
}

export async function initializeDatabase() {
  const { expenses, trips, categories, recurring, lent } = await collections();
  await expenses.createIndex({ date: -1 });
  await expenses.createIndex({ tripId: 1, date: -1 });
  await trips.createIndex({ startDate: -1 });
  const categoryIndexes = await categories.listIndexes().toArray();
  if (categoryIndexes.some((index) => index.name === "name_1")) await categories.dropIndex("name_1");
  await categories.createIndex({ userId: 1, name: 1 }, { unique: true, name: "user_category_unique" });
  await recurring.createIndex({ active: 1, nextRunDate: 1 });
  await lent.createIndex({ userId: 1, status: 1, date: -1 });
  await expenses.createIndex(
    { recurringExpenseId: 1, date: 1 },
    { unique: true, name: "recurring_occurrence_unique", partialFilterExpression: { recurringExpenseId: { $type: "objectId" } } },
  );
  await expenses.updateMany({ userId: { $exists: false } }, { $set: { userId: null } });
  await trips.updateMany({ userId: { $exists: false } }, { $set: { userId: null } });
  await categories.updateMany({ userId: { $exists: false } }, { $set: { userId: null } });
  await recurring.updateMany({ userId: { $exists: false } }, { $set: { userId: null } });
}

function cleanLent(input) {
  const person = String(input.person || "").trim().slice(0, 100);
  const amount = Number(input.amount);
  if (!person) throw new Error("Person name is required");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.date)) throw new Error("A valid date is required");
  return {
    person,
    amount: Math.round(amount * 100) / 100,
    date: input.date,
    note: String(input.note || "").trim().slice(0, 240),
    status: input.status === "collected" ? "collected" : "pending",
    collectedAt: input.status === "collected" ? new Date() : null,
  };
}

export async function listMoneyLent(userId, query = {}) {
  const { lent } = await collections();
  const filter = { userId: ownerId(userId) };
  if (query.status === "pending" || query.status === "collected") filter.status = query.status;
  return lent.find(filter).sort({ status: 1, date: -1, createdAt: -1 }).toArray();
}

export async function createMoneyLent(userId, input) {
  const { lent } = await collections();
  const userObjectId = ownerId(userId);
  const record = { ...cleanLent(input), userId: userObjectId, createdAt: new Date(), updatedAt: new Date() };
  const result = await lent.insertOne(record);
  return lent.findOne({ _id: result.insertedId, userId: userObjectId });
}

export async function updateMoneyLent(userId, id, input) {
  const { lent } = await collections();
  const userObjectId = ownerId(userId);
  const result = await lent.findOneAndUpdate({ _id: toId(id), userId: userObjectId }, { $set: { ...cleanLent(input), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Lent money record not found");
  return result;
}

export async function markMoneyCollected(userId, id) {
  const { lent } = await collections();
  const result = await lent.findOneAndUpdate({ _id: toId(id), userId: ownerId(userId) }, { $set: { status: "collected", collectedAt: new Date(), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Lent money record not found");
  return result;
}

export async function deleteMoneyLent(userId, id) {
  const { lent } = await collections();
  const result = await lent.deleteOne({ _id: toId(id), userId: ownerId(userId) });
  if (!result.deletedCount) throw new Error("Lent money record not found");
}

export async function seedInitialCategories(userId) {
  const { categories } = await collections();
  const userObjectId = ownerId(userId);
  for (const [name, icon, color] of INITIAL_CATEGORIES) {
    await categories.updateOne({ userId: userObjectId, name }, { $setOnInsert: { userId: userObjectId, name, icon, color, hidden: false, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
  }
  return listCategories(userId, true);
}

export async function listCategories(userId, includeHidden = false) {
  const { categories } = await collections();
  const filter = { userId: ownerId(userId) };
  if (!includeHidden) filter.hidden = { $ne: true };
  return categories.find(filter).sort({ name: 1 }).toArray();
}

function cleanCategory(input) {
  const name = String(input.name || "").trim().slice(0, 40);
  if (!name) throw new Error("Category name is required");
  if (!/^#[0-9a-f]{6}$/i.test(input.color || "")) throw new Error("Category color must be a hex color");
  return { name, icon: String(input.icon || "•").trim().slice(0, 4), color: input.color, hidden: Boolean(input.hidden) };
}

export async function createCategory(userId, input) {
  const { categories } = await collections();
  const category = { ...cleanCategory(input), userId: ownerId(userId), createdAt: new Date(), updatedAt: new Date() };
  try { const result = await categories.insertOne(category); return categories.findOne({ _id: result.insertedId, userId: category.userId }); } catch (error) { if (error.code === 11000) throw new Error("Category already exists"); throw error; }
}

export async function updateCategory(userId, id, input) {
  const categoryId = toId(id);
  if (!categoryId) throw new Error("Invalid category id");
  const { categories, expenses, recurring } = await collections();
  const userObjectId = ownerId(userId);
  const previous = await categories.findOne({ _id: categoryId, userId: userObjectId });
  if (!previous) throw new Error("Category not found");
  const category = cleanCategory(input);
  if (category.name !== previous.name && await categories.findOne({ userId: userObjectId, name: category.name, _id: { $ne: categoryId } })) throw new Error("Category already exists");
  const result = await categories.findOneAndUpdate({ _id: categoryId, userId: userObjectId }, { $set: { ...category, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Category not found");
  if (category.name !== previous.name) {
    await expenses.updateMany({ userId: userObjectId, category: previous.name }, { $set: { category: category.name, updatedAt: new Date() } });
    await recurring.updateMany({ userId: userObjectId, category: previous.name }, { $set: { category: category.name, updatedAt: new Date() } });
  }
  return result;
}

export async function deleteCategory(userId, id) {
  const categoryId = toId(id);
  const { categories, expenses } = await collections();
  const userObjectId = ownerId(userId);
  const category = await categories.findOne({ _id: categoryId, userId: userObjectId });
  if (!category) throw new Error("Category not found");
  if (await expenses.findOne({ userId: userObjectId, category: category.name })) throw new Error("Category has expenses; hide it instead");
  await categories.deleteOne({ _id: categoryId, userId: userObjectId });
}

export async function listExpenses(userId, query = {}) {
  const { expenses } = await collections();
  const filter = { userId: ownerId(userId) };
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) filter.date = { $gte: `${query.month}-01`, $lte: `${query.month}-31` };
  if (query.category) filter.category = query.category;
  if (query.tripId) {
    const id = toId(query.tripId);
    if (!id) return [];
    filter.tripId = id;
  }
  return expenses.find(filter).sort({ date: -1, createdAt: -1 }).toArray();
}

export async function createExpense(userId, input) {
  const { expenses, trips } = await collections();
  const userObjectId = ownerId(userId);
  const expense = await cleanExpense(input, userObjectId);
  if (expense.tripId && !(await trips.findOne({ _id: expense.tripId, userId: userObjectId }))) throw new Error("Trip not found");
  const now = new Date();
  const result = await expenses.insertOne({ ...expense, userId: userObjectId, createdAt: now, updatedAt: now });
  return expenses.findOne({ _id: result.insertedId, userId: userObjectId });
}

export async function updateExpense(userId, id, input) {
  const expenseId = toId(id);
  if (!expenseId) throw new Error("Invalid expense id");
  const { expenses, trips } = await collections();
  const userObjectId = ownerId(userId);
  const expense = await cleanExpense(input, userObjectId);
  if (expense.tripId && !(await trips.findOne({ _id: expense.tripId, userId: userObjectId }))) throw new Error("Trip not found");
  const result = await expenses.findOneAndUpdate({ _id: expenseId, userId: userObjectId }, { $set: { ...expense, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Expense not found");
  return result;
}

export async function deleteExpense(userId, id) {
  const { expenses } = await collections();
  const result = await expenses.deleteOne({ _id: toId(id), userId: ownerId(userId) });
  if (!result.deletedCount) throw new Error("Expense not found");
}

export async function listTrips(userId) {
  const { trips, expenses } = await collections();
  const userObjectId = ownerId(userId);
  const allTrips = await trips.find({ userId: userObjectId }).sort({ startDate: -1 }).toArray();
  return Promise.all(allTrips.map(async (trip) => ({ ...trip, spent: (await expenses.aggregate([{ $match: { userId: userObjectId, tripId: trip._id } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray())[0]?.total || 0 })));
}

export async function createTrip(userId, input) {
  const { trips } = await collections();
  const trip = { ...cleanTrip(input), userId: ownerId(userId), createdAt: new Date(), updatedAt: new Date() };
  const result = await trips.insertOne(trip);
  return trips.findOne({ _id: result.insertedId });
}

export async function updateTrip(userId, id, input) {
  const { trips } = await collections();
  const result = await trips.findOneAndUpdate({ _id: toId(id), userId: ownerId(userId) }, { $set: { ...cleanTrip(input), updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Trip not found");
  return result;
}

export async function deleteTrip(userId, id) {
  const tripId = toId(id);
  const { expenses, trips } = await collections();
  const userObjectId = ownerId(userId);
  const result = await trips.deleteOne({ _id: tripId, userId: userObjectId });
  if (!result.deletedCount) throw new Error("Trip not found");
  await expenses.updateMany({ userId: userObjectId, tripId }, { $set: { tripId: null, updatedAt: new Date() } });
}

export async function getDashboard(userId, month) {
  const expenses = await listExpenses(userId, { month });
  const categories = await listCategories(userId, true);
  const categoryTotals = Object.fromEntries(categories.map((category) => [category.name, 0]));
  const paymentTotals = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0]));
  for (const expense of expenses) {
    categoryTotals[expense.category] += expense.amount;
    paymentTotals[expense.paymentMethod] += expense.amount;
  }
  return { total: expenses.reduce((sum, expense) => sum + expense.amount, 0), count: expenses.length, categoryTotals, paymentTotals, expenses };
}

function occurrenceDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextOccurrence(date, frequency) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function cleanRecurring(input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  if (!dateIsValid(input.startDate)) throw new Error("A valid start date is required");
  if (!['weekly', 'monthly'].includes(input.frequency)) throw new Error("Frequency must be weekly or monthly");
  return { name: String(input.name || input.description || "Recurring expense").trim().slice(0, 100), amount: Math.round(amount * 100) / 100, category: String(input.category || ""), description: String(input.description || "").trim().slice(0, 240), paymentMethod: PAYMENT_METHODS.includes(input.paymentMethod) ? input.paymentMethod : "Other", frequency: input.frequency, startDate: input.startDate, endDate: input.endDate && dateIsValid(input.endDate) ? input.endDate : null, nextRunDate: input.startDate, active: input.active !== false };
}

export async function listRecurring(userId) {
  const { recurring } = await collections();
  return recurring.find({ userId: ownerId(userId) }).sort({ active: -1, nextRunDate: 1 }).toArray();
}

export async function createRecurring(userId, input) {
  const { recurring, categories } = await collections();
  const userObjectId = ownerId(userId);
  const rule = cleanRecurring(input);
  if (!(await categories.findOne({ userId: userObjectId, name: rule.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
  const result = await recurring.insertOne({ ...rule, userId: userObjectId, createdAt: new Date(), updatedAt: new Date() });
  await generateRecurringExpenses(userId);
  return recurring.findOne({ _id: result.insertedId, userId: userObjectId });
}

export async function updateRecurring(userId, id, input) {
  const { recurring, categories } = await collections();
  const userObjectId = ownerId(userId);
  const rule = cleanRecurring(input);
  if (!(await categories.findOne({ userId: userObjectId, name: rule.category, hidden: { $ne: true } }))) throw new Error("Invalid or hidden category");
  const result = await recurring.findOneAndUpdate({ _id: toId(id), userId: userObjectId }, { $set: { ...rule, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw new Error("Recurring expense not found");
  await generateRecurringExpenses(userId);
  return result;
}

export async function deleteRecurring(userId, id) {
  const { recurring } = await collections();
  const result = await recurring.deleteOne({ _id: toId(id), userId: ownerId(userId) });
  if (!result.deletedCount) throw new Error("Recurring expense not found");
}

export async function generateRecurringExpenses(userId, today = new Date()) {
  const { recurring, expenses } = await collections();
  const userObjectId = ownerId(userId);
  const rules = await recurring.find({ userId: userObjectId, active: true, nextRunDate: { $lte: occurrenceDate(today) } }).toArray();
  let created = 0;
  for (const rule of rules) {
    let runDate = rule.nextRunDate;
    while (runDate <= occurrenceDate(today) && (!rule.endDate || runDate <= rule.endDate)) {
      const expense = { amount: rule.amount, date: runDate, category: rule.category, description: rule.description || rule.name, paymentMethod: rule.paymentMethod, tripId: null, recurringExpenseId: rule._id, userId: userObjectId, createdAt: new Date(), updatedAt: new Date() };
      const result = await expenses.updateOne({ userId: userObjectId, recurringExpenseId: rule._id, date: runDate }, { $setOnInsert: expense }, { upsert: true });
      if (result.upsertedCount) created += 1;
      runDate = occurrenceDate(nextOccurrence(new Date(`${runDate}T00:00:00`), rule.frequency));
    }
    await recurring.updateOne({ _id: rule._id, userId: userObjectId }, { $set: { nextRunDate: runDate, active: !rule.endDate || runDate <= rule.endDate, updatedAt: new Date() } });
  }
  return { created };
}

export async function generateRecurringExpensesForAllUsers(today = new Date()) {
  const { recurring } = await collections();
  const userIds = await recurring.distinct("userId", { active: true });
  let created = 0;
  for (const userId of userIds) {
    if (!userId) continue;
    created += (await generateRecurringExpenses(userId, today)).created;
  }
  return { users: userIds.filter(Boolean).length, created };
}

function millisecondsUntilNextRun(hour = 2) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startRecurringExpenseJob() {
  const run = async () => {
    try {
      const result = await generateRecurringExpensesForAllUsers();
      console.log(`Recurring expense job completed: ${result.created} expense(s) generated for ${result.users} user(s).`);
    } catch (error) {
      console.error("Recurring expense job failed:", error.message);
    } finally {
      setTimeout(run, millisecondsUntilNextRun(Number(process.env.RECURRING_JOB_HOUR || 2)));
    }
  };

  void run();
}