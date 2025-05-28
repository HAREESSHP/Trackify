const API_BASE = 'http://localhost:3001';

// Transaction state
let transactions = [];

// DOM elements
const totalBalanceEl = document.getElementById('totalBalance');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const transactionForm = document.getElementById('transactionForm');
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type');
const categoryInput = document.getElementById('category');
const transactionTableBody = document.getElementById('transactionTableBody');
const searchInput = document.getElementById('searchInput');
const reportChart = document.getElementById('reportChart');

// Profile modal elements
const profileForm = document.getElementById('profile-form');
const profileName = document.getElementById('profile-name');
const profilePhone = document.getElementById('profile-phone');
const profilePassword = document.getElementById('profile-password');
const profilePassword2 = document.getElementById('profile-password2');
const profileStatus = document.getElementById('profile-status');

// Fetch transactions from backend (replace with your API if needed)
async function fetchTransactions() {
  const res = await fetch(`${API_BASE}/api/expenses`, { credentials: 'include' });
  if (res.ok) {
    const data = await res.json();
    transactions = data.map(e => ({
      id: e._id,
      date: e.date || new Date().toISOString().split('T')[0],
      amount: Number(e.amount),
      category: e.category || '',
      type: e.type === 'income' ? 'income' : 'expense'
    }));
  } else {
    transactions = [];
  }
}

// Render summary cards
function renderSummary() {
  let income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  let expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  totalIncomeEl.textContent = income;
  totalExpenseEl.textContent = expense;
  totalBalanceEl.textContent = income - expense;
}

// Render transaction tablemon
function renderTransactions(filter = '') {
  let filtered = transactions.filter(t =>
    t.category.toLowerCase().includes(filter.toLowerCase())
  );
  transactionTableBody.innerHTML = '';
  if (!filtered.length) {
    transactionTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">No transactions found.</td></tr>';
    return;
  }
  filtered.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.amount}</td>
      <td>${t.category}</td>
      <td>${t.type}</td>
      <td>
        <button onclick="editTransaction('${t.id}')">✏️</button>
        <button onclick="deleteTransaction('${t.id}')">🗑️</button>
      </td>
    `;
    transactionTableBody.appendChild(tr);
  });
}

// Render charts for monthly expenses by category and yearly expenses by month
function renderCharts() {
  // Pie chart for monthly expenditure by category
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthly = transactions.filter(t => t.type === 'expense' && new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear);
  const categoryTotals = {};
  monthly.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });
  const pieLabels = Object.keys(categoryTotals);
  const pieData = Object.values(categoryTotals);
  const pieColors = pieLabels.map((_, i) => `hsl(${i * 360 / pieLabels.length}, 70%, 60%)`);

  // Bar chart for yearly expenditure by month
  const months = Array.from({length: 12}, (_, i) => new Date(0, i).toLocaleString('default', {month: 'short'}));
  const monthlyExpense = Array(12).fill(0);
  transactions.forEach(t => {
    if (t.type === 'expense' && new Date(t.date).getFullYear() === currentYear) {
      const m = new Date(t.date).getMonth();
      monthlyExpense[m] += t.amount;
    }
  });

  // Remove any existing charts
  if (window.pieChartInstance) window.pieChartInstance.destroy();
  if (window.barChartInstance) window.barChartInstance.destroy();

  // Create pie chart
  const pieCanvas = document.getElementById('pieChart');
  if (pieCanvas) {
    window.pieChartInstance = new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieData,
          backgroundColor: pieColors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'bottom' },
          title: { display: true, text: 'Monthly Expenditure by Category', font: { size: 18 } }
        }
      }
    });
  }

  // Create bar chart
  const barCanvas = document.getElementById('barChart');
  if (barCanvas) {
    window.barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Expenses',
          data: monthlyExpense,
          backgroundColor: '#2ec4b6',
          borderRadius: 8,
          barPercentage: 0.7
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Yearly Expenditure by Month', font: { size: 18 } }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 14 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e0e7ef' },
            ticks: { font: { size: 14 } }
          }
        }
      }
    });
  }
}

// Add transaction (now supports income/expense, no title)
transactionForm.onsubmit = async function(e) {
  e.preventDefault();
  const amount = Number(amountInput.value);
  const category = categoryInput.value.trim();
  const type = typeInput.value;
  const res = await fetch(`${API_BASE}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, category, type }),
    credentials: 'include'
  });
  if (res.ok) {
    await fetchTransactions();
    renderSummary();
    renderTransactions(searchInput.value);
    renderCharts();
    transactionForm.reset();
  } else {
    alert('Failed to add transaction.');
  }
};

// Delete transaction
window.deleteTransaction = async function(id) {
  await fetch(`${API_BASE}/api/expenses/${id}`, { method: 'DELETE', credentials: 'include' });
  await fetchTransactions();
  renderSummary();
  renderTransactions(searchInput.value);
  renderCharts();
};

// Edit transaction (no title)
window.editTransaction = async function(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  const newAmount = prompt('Edit Amount:', t.amount);
  const newCategory = prompt('Edit Category:', t.category);
  const newType = prompt('Edit Type (income/expense):', t.type);
  if (newAmount && newCategory && (newType === 'income' || newType === 'expense')) {
    await fetch(`${API_BASE}/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(newAmount), category: newCategory, type: newType }),
      credentials: 'include'
    });
    await fetchTransactions();
    renderSummary();
    renderTransactions(searchInput.value);
    renderCharts();
  }
};

// Search
searchInput.oninput = function() {
  renderTransactions(searchInput.value);
};

// Profile logic
async function loadProfile() {
  const res = await fetch(`${API_BASE}/api/profile`, { credentials: 'include' });
  if (res.ok) {
    const data = await res.json();
    profileName.value = data.name || '';
    profilePhone.value = data.phone || '';
    if (document.getElementById('profile-name-short')) {
      document.getElementById('profile-name-short').textContent = data.name ? data.name.split(' ')[0] : (data.phone || 'Profile');
    }
  }
}
if (profileForm) {
  profileForm.onsubmit = async function(e) {
    e.preventDefault();
    const name = profileName.value.trim();
    const phone = profilePhone.value.trim();
    const password = profilePassword.value.trim();
    const password2 = profilePassword2.value.trim();
    if (!name) {
      profileStatus.textContent = 'Please enter your full name.';
      profileStatus.style.color = '#ef4444';
      profileName.focus();
      return;
    }
    if (!phone) {
      profileStatus.textContent = 'Please enter your phone number.';
      profileStatus.style.color = '#ef4444';
      profilePhone.focus();
      return;
    }
    if (password || password2) {
      if (password.length < 6 || !(/[a-zA-Z]/.test(password) && /[0-9]/.test(password))) {
        profileStatus.textContent = 'Password must be at least 6 characters and contain both letters and numbers.';
        profileStatus.style.color = '#ef4444';
        profilePassword.focus();
        return;
      }
      if (password !== password2) {
        profileStatus.textContent = 'Passwords do not match.';
        profileStatus.style.color = '#ef4444';
        profilePassword2.focus();
        return;
      }
    }
    // Save profile to backend (name, phone, password if provided)
    try {
      const body = password ? { name, phone, password } : { name, phone };
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        profileStatus.textContent = 'Profile updated!';
        profileStatus.style.color = '#10b981';
        profilePassword.value = '';
        profilePassword2.value = '';
        if (document.getElementById('profile-name-short')) {
          document.getElementById('profile-name-short').textContent = name.split(' ')[0];
        }
      } else {
        profileStatus.textContent = data.error || 'Failed to update profile.';
        profileStatus.style.color = '#ef4444';
      }
    } catch (err) {
      profileStatus.textContent = 'Network error. Please try again.';
      profileStatus.style.color = '#ef4444';
    }
  };
}

// Hamburger menu toggle for mobile navbar
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.dashboard-navbar .navbar-toggle');
  const links = document.querySelector('.dashboard-navbar .navbar-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });
  }

  // Logout button logic
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      try {
        const res = await fetch(`${API_BASE}/api/logout`, {
          method: 'POST',
          credentials: 'include'
        });
        if (res.ok) {
          window.location.href = 'index.html';
        } else {
          alert('Logout failed.');
        }
      } catch (err) {
        alert('Server error during logout.');
      }
    });
  }
});

// Initial load
(async function() {
  await fetchTransactions();
  renderSummary();
  renderTransactions();
  renderCharts();
  await loadProfile();
})();
