const $ = (id) => document.getElementById(id);
const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (value, offset) => {
  const [year, monthNumber] = value.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return monthKey(date);
};
let month = monthKey(new Date()),
  meta = { categories: [], paymentMethods: [] },
  trips = [];
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("themeIcon").textContent = dark ? "☀" : "☾";
  $("themeLabel").textContent = dark ? "Light" : "Dark";
  $("themeToggle").setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode",
  );
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  if (dark) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = "dark";
  localStorage.setItem("ledger-theme", dark ? "light" : "dark");
  updateThemeButton();
}
function localDate() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
async function api(path, options) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    showAuth();
    throw new Error("Authentication required");
  }
  if (!res.ok)
    throw new Error((await res.json()).error || "Something went wrong");
  return res.status === 204 ? null : res.json();
}
let authMode = "login";
function showAuth() {
  $("authLoading").style.display = "none";
  $("authScreen").style.display = "grid";
  $("appShell").classList.add("app-hidden");
}
function showApp(user) {
  $("authLoading").style.display = "none";
  $("authScreen").style.display = "none";
  $("appShell").classList.remove("app-hidden");
  $("userName").textContent = user.name;
  load();
}
function fillSelect(id, values) {
  $(id).innerHTML = values.map((value) => `<option>${value}</option>`).join("");
}
async function load() {
  try {
    const [dashboard, tripData, lentData, recurringData, categoriesData] =
      await Promise.all([
        api(`/dashboard?month=${month}`),
        api("/trips"),
        api("/money-lent"),
        api("/recurring"),
        api("/categories?includeHidden=true"),
      ]);
    trips = tripData;
    lentRecords = lentData;
    recurringRules = recurringData;
    categoryRecords = categoriesData;
    renderRecurring();
    renderCategories();
    renderMoneyLent();
    $("monthLabel").textContent = new Date(
      `${month}-01T00:00:00`,
    ).toLocaleString("en-IN", { month: "long", year: "numeric" });
    $("monthTitle").textContent = new Date(
      `${month}-01T00:00:00`,
    ).toLocaleString("en-IN", { month: "long" });
    $("total").textContent = money(dashboard.total);
    $("count").textContent = dashboard.count;
    const top = Object.entries(dashboard.categoryTotals).sort(
      (a, b) => b[1] - a[1],
    )[0];
    $("topCategory").textContent = top && top[1] ? top[0] : "—";
    renderExpenses(dashboard.expenses);
  } catch (error) {
    $("expenseList").innerHTML =
      `<div class="empty">${error.message}. Is MongoDB running?</div>`;
  }
}
function renderDaily(items) {
  const grouped = items.reduce((days, item) => {
      (days[item.date] ??= []).push(item);
      return days;
    }, {}),
    dates = Object.keys(grouped).sort().reverse(),
    total = items.reduce((sum, item) => sum + item.amount, 0);
  $("dailyTotalPage").textContent = dates.length
    ? `${dates.length} active days · ${money(total)}`
    : "";
  const dailyMarkup = dates.length
    ? dates
        .map((date) => {
          const dayItems = grouped[date],
            dayTotal = dayItems.reduce((sum, item) => sum + item.amount, 0),
            categories = [...new Set(dayItems.map((item) => item.category))];
          const day = new Date(`${date}T00:00:00`);
          return `<button class="daily-row" data-day="${date}"><span class="daily-date">${day.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}<small>${day.toLocaleDateString("en-IN", { weekday: "long" })}</small></span><span class="daily-summary">${categories.map((category) => `<span>${category}</span>`).join("")}</span><strong class="daily-amount">${money(dayTotal)}</strong></button>`;
        })
        .join("")
    : '<div class="empty">No expenses recorded this month.</div>';
  $("dailyListPage").innerHTML = dailyMarkup;
}
function showDayDetails(date, items) {
  const dayItems = items.filter((item) => item.date === date),
    day = new Date(`${date}T00:00:00`),
    totals = {};
  dayItems.forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + item.amount;
  });
  const categoryRows = Object.entries(totals).sort((a, b) => b[1] - a[1]),
    dayTotal = dayItems.reduce((sum, item) => sum + item.amount, 0);
  let cursor = 0;
  const colors = [
    "#e5735b",
    "#5b8def",
    "#e6a23c",
    "#b46ee8",
    "#4c9f70",
    "#e06c9f",
    "#49a6a6",
    "#d85b66",
    "#7c83d4",
    "#8b7565",
    "#718096",
  ];
  const segments = categoryRows.map(([category, value], index) => {
    const start = cursor;
    cursor += (value / dayTotal) * 100;
    const color =
      categoryRecords.find((record) => record.name === category)?.color ||
      colors[index % colors.length];
    return `${color} ${start}% ${cursor}%`;
  });
  $("dayTitle").textContent = day.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("dayTotal").textContent =
    `${dayItems.length} transaction${dayItems.length === 1 ? "" : "s"} · ${money(dayTotal)}`;
  $("dayPie").style.background = categoryRows.length
    ? `conic-gradient(${segments.join(",")})`
    : "var(--line)";
  $("dayLegend").innerHTML = categoryRows
    .map(([category, value], index) => {
      const color =
        categoryRecords.find((record) => record.name === category)?.color ||
        colors[index % colors.length];
      const percent = Math.round((value / dayTotal) * 100);
      return `<div class="legend-row"><span class="legend-dot" style="background:${color}"></span><span>${category}<small>${percent}% of daily spending</small></span><strong>${money(value)}</strong></div>`;
    })
    .join("");
  $("dayCategories").innerHTML = categoryRows
    .map(
      ([category, value]) =>
        `<span class="day-category">${category}: ${money(value)}</span>`,
    )
    .join("");
  $("dayTransactions").innerHTML = dayItems
    .map(
      (item) =>
        `<div class="day-transaction"><div><h3>${item.description || item.category}</h3><small>${item.category}${item.paymentMethod ? " · " + item.paymentMethod : ""}</small></div><strong>${money(item.amount)}</strong></div>`,
    )
    .join("");
  $("dayModal").classList.add("open");
}
async function renderCharts(items) {
  renderDaily(items);
  const dates = [];
  const current = new Date(`${month}-01T00:00:00`);
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(
      current.getFullYear(),
      current.getMonth() - offset,
      1,
    );
    dates.push({
      key: monthKey(date),
      label: date.toLocaleString("en-IN", { month: "short" }),
    });
  }
  try {
    const summaries = await Promise.all(
      dates.map((date) => api(`/dashboard?month=${date.key}`)),
    );
    const maxTotal = Math.max(...summaries.map((summary) => summary.total), 1);
    $("trendChart").innerHTML = dates
      .map(
        (date, index) =>
          `<div class="trend-item ${index === 5 ? "current" : ""}"><div class="trend-bar" style="--height:${Math.max((summaries[index].total / maxTotal) * 100, 3)}%" title="${money(summaries[index].total)}"></div><b>${money(summaries[index].total)}</b><small>${date.label}</small></div>`,
      )
      .join("");
    const currentTotal = summaries[5].total,
      previousTotal = summaries[4].total;
    const difference = previousTotal
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
      : 0;
    $("insight").textContent = currentTotal
      ? "You spent " +
        (difference > 0
          ? `${difference}% more than last month.`
          : difference < 0
            ? `${Math.abs(difference)}% less than last month.`
            : "about the same as last month.")
      : "No expenses recorded this month yet.";
  } catch (error) {
    $("trendChart").innerHTML = '<div class="empty">Trend unavailable.</div>';
  }
}
function renderMonthlyCategoryBars(items) {
  const totals = {};
  items.forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + item.amount;
  });
  const rows = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    max = rows[0]?.[1] || 1;
  $("categoryChart").innerHTML = rows.length
    ? rows
        .map(
          ([name, value]) =>
            `<div class="category-row"><span>${name}</span><div class="category-track"><i style="width:${(value / max) * 100}%"></i></div><strong>${money(value)}</strong></div>`,
        )
        .join("")
    : '<div class="empty">No category data yet.</div>';
  document.querySelectorAll("#trendChart .trend-item").forEach((item) => {
    const value = Number(
      item.querySelector("b")?.textContent.replace(/[^0-9.]/g, ""),
    );
    if (!value) item.remove();
  });
  if (!$("trendChart").querySelector(".trend-item"))
    $("trendChart").innerHTML =
      '<div class="empty">No monthly spending data yet.</div>';
}
async function renderExpenses(items) {
  await renderCharts(items);
  renderMonthlyCategoryBars(items);
  const query = $("search").value.toLowerCase(),
    cat = $("categoryFilter").value;
  items = items.filter(
    (x) =>
      (!cat || x.category === cat) &&
      (!query ||
        `${x.description} ${x.category}`.toLowerCase().includes(query)),
  );
  $("expenseList").innerHTML = items.length
    ? items
        .map(
          (x) =>
            `<article class="expense"><div class="dot">${x.category[0]}</div><div><h3>${x.description || x.category}</h3><small>${new Date(`${x.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${x.category}${x.paymentMethod ? " · " + x.paymentMethod : ""}</small></div><div class="amount">${money(x.amount)}<small><button class="delete" data-edit="${x._id}">Edit</button><button class="delete" data-delete="${x._id}">Delete</button></small></div></article>`,
        )
        .join("")
    : '<div class="empty">No expenses for this view.</div>';
}
let recurringRules = [],
  categoryRecords = [],
  lentRecords = [];
function renderTrips() {
  $("tripList").innerHTML = trips.length
    ? trips
        .map((t) => {
          const percent = t.budget
            ? Math.min(100, (t.spent / t.budget) * 100)
            : 0;
          return `<article class="trip"><div class="trip-row"><div><h3>${t.name}</h3><p>${t.destination || "No destination"} · ${t.startDate} to ${t.endDate}</p></div><button class="delete" data-trip-delete="${t._id}">Delete</button></div>${t.budget ? `<div class="bar"><i style="width:${percent}%"></i></div><div class="trip-foot"><span>${money(t.spent)} spent</span><span>${money(t.budget)} budget</span></div>` : `<div class="trip-foot"><span>${money(t.spent)} spent</span></div>`}</article>`;
        })
        .join("")
    : '<div class="empty">Create a trip to keep its costs together.</div>';
  $("tripId").innerHTML =
    '<option value="">No trip</option>' +
    trips.map((t) => `<option value="${t._id}">${t.name}</option>`).join("");
}
function renderRecurring() {
  $("recurringList").innerHTML = recurringRules.length
    ? recurringRules
        .map(
          (rule) =>
            `<div class="manage-row"><div class="manage-icon" style="background:#edf4e9">↻</div><div><h3>${rule.name} · ${money(rule.amount)}</h3><small>${rule.frequency} · ${rule.category} · next on ${rule.nextRunDate}</small></div><div class="manage-actions"><span class="status">${rule.active ? "Active" : "Complete"}</span><button class="delete" data-recurring-edit="${rule._id}">Edit</button><button class="delete" data-recurring-delete="${rule._id}">Delete</button></div></div>`,
        )
        .join("")
    : '<div class="empty">Add rent, bills, subscriptions, salary, or EMIs here.</div>';
}
function renderCategories() {
  $("categoriesList").innerHTML = categoryRecords.length
    ? categoryRecords
        .map(
          (category) =>
            `<div class="manage-row ${category.hidden ? "hidden-row" : ""}"><div class="manage-icon" style="background:${category.color}22;color:${category.color}">${category.icon}</div><div><h3>${category.name}</h3><small>${category.hidden ? "Hidden from expense forms" : "Available for expenses"}</small></div><div class="manage-actions">${category.hidden ? '<span class="status">Hidden</span>' : ""}<button class="delete" data-category-edit="${category._id}">Edit</button><button class="delete" data-category-delete="${category._id}">Delete</button></div></div>`,
        )
        .join("")
    : '<div class="empty">No categories yet. Run the seed command or add one here.</div>';
}
function renderMoneyLent() {
  $("lentSummary").innerHTML = (() => {
    const pending = lentRecords
        .filter((record) => record.status === "pending")
        .reduce((sum, record) => sum + record.amount, 0),
      collected = lentRecords
        .filter((record) => record.status === "collected")
        .reduce((sum, record) => sum + record.amount, 0);
    return `<div class="lent-stat"><small>Still to collect</small><strong>${money(pending)}</strong></div><div class="lent-stat"><small>Collected</small><strong>${money(collected)}</strong></div>`;
  })();
  $("lentList").innerHTML = lentRecords.length
    ? lentRecords
        .map(
          (record) =>
            `<div class="lent-row"><div class="lent-avatar">${record.person[0].toUpperCase()}</div><div><h3>${record.person} <span class="lent-status ${record.status}">${record.status}</span></h3><small>${record.date}${record.note ? " · " + record.note : ""}</small></div><div class="lent-amount">${money(record.amount)}<div class="lent-actions">${record.status === "pending" ? `<button class="delete collected" data-lent-collect="${record._id}">Mark collected</button>` : ""}<button class="delete" data-lent-edit="${record._id}">Edit</button><button class="delete" data-lent-delete="${record._id}">Delete</button></div></div></div>`,
        )
        .join("")
    : '<div class="empty">Track money you have helped friends with here.</div>';
}
function openExpense(expense) {
  $("expenseTitle").textContent = expense ? "Edit expense" : "Add expense";
  $("expenseId").value = expense ? expense._id : "";
  $("amount").value = expense?.amount || "";
  $("date").value = expense?.date || localDate();
  $("category").value = expense?.category || meta.categories[0];
  $("paymentMethod").value = expense?.paymentMethod || meta.paymentMethods[0];
  $("tripId").value = expense?.tripId || "";
  $("description").value = expense?.description || "";
  $("expenseModal").classList.add("open");
}
$("expenseForm").onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    amount: $("amount").value,
    date: $("date").value,
    category: $("category").value,
    paymentMethod: $("paymentMethod").value,
    tripId: $("tripId").value,
    description: $("description").value,
  };
  try {
    const id = $("expenseId").value;
    await api(id ? `/expenses/${id}` : "/expenses", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    $("expenseModal").classList.remove("open");
    load();
  } catch (error) {
    $("expenseNotice").textContent = error.message;
  }
};
$("tripForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/trips", {
      method: "POST",
      body: JSON.stringify({
        name: $("tripName").value,
        destination: $("destination").value,
        startDate: $("startDate").value,
        endDate: $("endDate").value,
        budget: $("budget").value,
        notes: $("tripNotes").value,
      }),
    });
    $("tripModal").classList.remove("open");
    e.target.reset();
    load();
  } catch (error) {
    $("tripNotice").textContent = error.message;
  }
};
$("recurringForm").onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    name: $("recurringName").value,
    amount: $("recurringAmount").value,
    category: $("recurringCategory").value,
    frequency: $("recurringFrequency").value,
    startDate: $("recurringStart").value,
    endDate: $("recurringEnd").value,
    paymentMethod: $("recurringPayment").value,
    description: $("recurringDescription").value,
  };
  try {
    const id = $("recurringId").value;
    await api(id ? `/recurring/${id}` : "/recurring", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    $("recurringModal").classList.remove("open");
    e.target.reset();
    load();
  } catch (error) {
    $("recurringNotice").textContent = error.message;
  }
};
$("categoryForm").onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    name: $("categoryName").value,
    icon: $("categoryIcon").value,
    color: $("categoryColor").value,
    hidden: $("categoryHidden").checked,
  };
  try {
    const id = $("categoryId").value;
    await api(id ? `/categories/${id}` : "/categories", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    $("categoryModal").classList.remove("open");
    e.target.reset();
    load();
  } catch (error) {
    $("categoryNotice").textContent = error.message;
  }
};
function openRecurring(rule) {
  $("recurringTitle").textContent = rule
    ? "Edit recurring expense"
    : "Add recurring expense";
  $("recurringId").value = rule ? rule._id : "";
  $("recurringName").value = rule?.name || "";
  $("recurringAmount").value = rule?.amount || "";
  $("recurringCategory").value = rule?.category || meta.categories[0];
  $("recurringFrequency").value = rule?.frequency || "monthly";
  $("recurringStart").value = rule?.startDate || localDate();
  $("recurringEnd").value = rule?.endDate || "";
  $("recurringPayment").value = rule?.paymentMethod || meta.paymentMethods[0];
  $("recurringDescription").value = rule?.description || "";
  $("recurringModal").classList.add("open");
}
function openCategory(category) {
  $("categoryTitle").textContent = category ? "Edit category" : "Add category";
  $("categoryId").value = category ? category._id : "";
  $("categoryName").value = category?.name || "";
  $("categoryIcon").value = category?.icon || "•";
  $("categoryColor").value = category?.color || "#5b8def";
  $("categoryHidden").checked = Boolean(category?.hidden);
  $("categoryModal").classList.add("open");
}
$("lentForm").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("lentId").value,
    current = lentRecords.find((record) => record._id === id);
  const body = {
    person: $("lentPerson").value,
    amount: $("lentAmount").value,
    date: $("lentDate").value,
    note: $("lentNote").value,
    status: current?.status || "pending",
  };
  try {
    await api(id ? `/money-lent/${id}` : "/money-lent", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    $("lentModal").classList.remove("open");
    e.target.reset();
    load();
  } catch (error) {
    $("lentNotice").textContent = error.message;
  }
};
function openLent(record) {
  $("lentTitle").textContent = record ? "Edit lending" : "Record money lent";
  $("lentId").value = record ? record._id : "";
  $("lentPerson").value = record?.person || "";
  $("lentAmount").value = record?.amount || "";
  $("lentDate").value = record?.date || localDate();
  $("lentNote").value = record?.note || "";
  $("lentModal").classList.add("open");
}
$("addButton").onclick = () => openExpense();
$("tripButton").onclick = () => {
  $("startDate").value = localDate();
  $("endDate").value = localDate();
  $("tripModal").classList.add("open");
};
$("lentButton").onclick = () => openLent();
$("prevMonth").onclick = () => {
  month = shiftMonth(month, -1);
  load();
};
$("nextMonth").onclick = () => {
  month = shiftMonth(month, 1);
  load();
};
$("search").oninput = () => load();
$("categoryFilter").onchange = () => load();
document
  .querySelectorAll("[data-close]")
  .forEach(
    (x) => (x.onclick = () => x.closest(".modal").classList.remove("open")),
  );
document.addEventListener("click", async (e) => {
  const edit = e.target.dataset.edit,
    del = e.target.dataset.delete,
    tripDel = e.target.dataset.tripDelete;
  if (edit) {
    const items = await api(`/expenses?month=${month}`);
    openExpense(items.find((x) => x._id === edit));
  }
  if (del && confirm("Delete this expense?")) {
    await api(`/expenses/${del}`, { method: "DELETE" });
    load();
  }
  if (tripDel && confirm("Delete this trip? Its expenses will be kept.")) {
    await api(`/trips/${tripDel}`, { method: "DELETE" });
    load();
  }
});
async function loadMeta() {
  meta = await api("/meta");
  fillSelect("category", meta.categories);
  $("categoryFilter").innerHTML =
    '<option value="">All categories</option>' +
    meta.categories.map((value) => `<option>${value}</option>`).join("");
  fillSelect("paymentMethod", meta.paymentMethods);
  fillSelect("recurringCategory", meta.categories);
  fillSelect("recurringPayment", meta.paymentMethods);
  $("date").value = localDate();
}
document.querySelectorAll(".auth-tab").forEach(
  (tab) =>
    (tab.onclick = () => {
      authMode = tab.dataset.authMode;
      document
        .querySelectorAll(".auth-tab")
        .forEach((item) => item.classList.toggle("active", item === tab));
      $("nameField").hidden = authMode !== "register";
      $("authName").required = authMode === "register";
      $("authPassword").autocomplete =
        authMode === "register" ? "new-password" : "current-password";
      $("authSubmit").textContent =
        authMode === "register" ? "Create account" : "Log in";
      $("authNotice").textContent = "";
    }),
);
$("authForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const path = authMode === "register" ? "/auth/register" : "/auth/login";
    const data = await api(path, {
      method: "POST",
      body: JSON.stringify({
        name: $("authName").value,
        email: $("authEmail").value,
        password: $("authPassword").value,
      }),
    });
    await loadMeta();
    showApp(data.user);
  } catch (error) {
    $("authNotice").textContent = error.message;
  }
};
$("logoutButton").onclick = async () => {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  showAuth();
};
(async () => {
  try {
    const data = await api("/auth/me");
    await loadMeta();
    showApp(data.user);
  } catch (error) {
    showAuth();
  }
})();
document.querySelectorAll(".tab").forEach(
  (tab) =>
    (tab.onclick = () => {
      document
        .querySelectorAll(".tab")
        .forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll(".view").forEach((view) => {
        const views = (tab.dataset.views || tab.dataset.view).split(",");
        view.classList.toggle("active", views.includes(view.id));
      });
      document.querySelectorAll(".context-switch").forEach((switcher) => {
        switcher.classList.toggle(
          "active",
          switcher.dataset.mode === tab.dataset.mode,
        );
      });
      if (tab.dataset.mode === "activity") activateSubViews("expensesView");
      if (tab.dataset.mode === "plans") activateSubViews("tripsView");
      if (tab.dataset.mode !== "activity") {
        document
          .querySelectorAll(".activity-switch .context-tab")
          .forEach((button) => button.classList.remove("active"));
      }
      if (tab.dataset.mode !== "plans") {
        document
          .querySelectorAll(".plans-switch .context-tab")
          .forEach((button) => button.classList.remove("active"));
      }
      $("viewEyebrow").textContent = tab.textContent;
    }),
);
function activateSubViews(viewId) {
  document.querySelectorAll(".context-tab").forEach((button) => {
    const views = button.dataset.subviews.split(",");
    const active = views.includes(viewId);
    button.classList.toggle("active", active);
    views.forEach((id) =>
      document.getElementById(id)?.classList.toggle("active", active),
    );
  });
}
document.querySelectorAll(".context-tab").forEach((button) => {
  button.onclick = () =>
    activateSubViews(button.dataset.subviews.split(",")[0]);
});
document.addEventListener("click", (event) => {
  const day = event.target.closest("[data-day]")?.dataset.day;
  if (day)
    api(`/expenses?month=${month}`).then((items) => showDayDetails(day, items));
});
document.addEventListener("click", async (event) => {
  const recurringEdit = event.target.dataset.recurringEdit,
    recurringDelete = event.target.dataset.recurringDelete,
    categoryEdit = event.target.dataset.categoryEdit,
    categoryDelete = event.target.dataset.categoryDelete,
    lentEdit = event.target.dataset.lentEdit,
    lentDelete = event.target.dataset.lentDelete,
    lentCollect = event.target.dataset.lentCollect;
  if (recurringEdit)
    openRecurring(recurringRules.find((rule) => rule._id === recurringEdit));
  if (categoryEdit)
    openCategory(
      categoryRecords.find((category) => category._id === categoryEdit),
    );
  if (lentEdit) openLent(lentRecords.find((record) => record._id === lentEdit));
  if (recurringDelete && confirm("Delete this recurring expense?")) {
    await api(`/recurring/${recurringDelete}`, { method: "DELETE" });
    load();
  }
  if (categoryDelete && confirm("Delete this category?")) {
    try {
      await api(`/categories/${categoryDelete}`, { method: "DELETE" });
      load();
    } catch (error) {
      alert(error.message);
    }
  }
  if (lentCollect) {
    await api(`/money-lent/${lentCollect}/collect`, { method: "POST" });
    load();
  }
  if (lentDelete && confirm("Delete this lending record?")) {
    await api(`/money-lent/${lentDelete}`, { method: "DELETE" });
    load();
  }
});
$("recurringButton").onclick = () => openRecurring();
$("categoryButton").onclick = () => openCategory();
updateThemeButton();
$("themeToggle").onclick = toggleTheme;
