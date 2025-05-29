// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const session = require('express-session');

const app = express();
const PORT = 3001;

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('ERROR: MONGODB_URI environment variable is not set!');
  process.exit(1);
}

console.log('Attempting to connect to MongoDB...');

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })


.then(() => {
    console.log('MongoDB connected!');
    process.stdout.write(''); // Force flush
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });


app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));


app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
  secret: 'trackify-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: false
  }
}));


const userSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  phone: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: Number,
  category: String,
  description: String,
  type: { type: String, enum: ['income', 'expense'], default: 'expense' },
  date: { type: String, default: () => new Date().toISOString().split('T')[0] }
});
const Expense = mongoose.model('Expense', expenseSchema);

const goalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // removed unique: true
  goal: Number
});
const Goal = mongoose.model('Goal', goalSchema);

const limitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // removed unique: true
  limit: Number
});
const Limit = mongoose.model('Limit', limitSchema);


function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}


app.post('/api/register', async (req, res) => {
  const { name = "", phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 6 || !(/[a-zA-Z]/.test(password) && /[0-9]/.test(password))) {
    return res.status(400).json({ error: 'Password must be at least 6 characters and contain both letters and numbers.' });
  }
  try {
    const existingUser = await User.findOne({ phone });
    if (existingUser) return res.status(409).json({ error: 'Phone number already registered' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, phone, password: hash });
    await user.save();
    req.session.userId = user._id;
    res.json({ message: 'User registered' });
  } catch (err) {
    console.error('Register error:', err); // Log error for debugging
    res.status(500).json({ error: 'Server error' });
  }
});

// Login: phone + password only
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user._id;
    res.json({ message: 'Login successful' });
  } catch (err) {
    console.error('Login error:', err); // Log error for debugging
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const user = await User.findById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  res.json({
    phone: user.phone
  });
});


app.get('/api/expenses', requireAuth, async (req, res) => {
  const expenses = await Expense.find({ userId: req.session.userId });
  res.json(expenses);
});
app.post('/api/expenses', requireAuth, async (req, res) => {
  const { amount, category, description, type } = req.body;
  const expense = new Expense({ userId: req.session.userId, amount, category, description, type });
  await expense.save();
  res.json(expense);
});
app.get('/api/expenses/:id', requireAuth, async (req, res) => {
  const exp = await Expense.findOne({ _id: req.params.id, userId: req.session.userId });
  if (!exp) return res.status(404).json({ error: 'Not found' });
  res.json(exp);
});
app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  const { amount, category, description, type } = req.body;
  const exp = await Expense.findOneAndUpdate(
    { _id: req.params.id, userId: req.session.userId },
    { amount, category, description, type },
    { new: true }
  );
  if (!exp) return res.status(404).json({ error: 'Not found' });
  res.json(exp);
});
app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  await Expense.deleteOne({ _id: req.params.id, userId: req.session.userId });
  res.json({ message: 'Deleted' });
});


app.get('/api/goals', requireAuth, async (req, res) => {
  const goal = await Goal.findOne({ userId: req.session.userId });
  res.json({ goal: goal ? goal.goal : null });
});
app.post('/api/goals', requireAuth, async (req, res) => {
  const { goal } = req.body;
  let g = await Goal.findOneAndUpdate(
    { userId: req.session.userId },
    { goal },
    { upsert: true, new: true }
  );
  res.json({ goal: g.goal });
});


app.get('/api/limits', requireAuth, async (req, res) => {
  const limit = await Limit.findOne({ userId: req.session.userId });
  res.json({ limit: limit ? limit.limit : null });
});
app.post('/api/limits', requireAuth, async (req, res) => {
  const { limit } = req.body;
  let l = await Limit.findOneAndUpdate(
    { userId: req.session.userId },
    { limit },
    { upsert: true, new: true }
  );
  res.json({ limit: l.limit });
});

// Profile management endpoints
app.get('/api/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = await User.findById(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    name: user.name || "",
    phone: user.phone
  });
});

app.put('/api/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { name, phone, password } = req.body;
  try {
    const update = { name, phone };
    if (password) {
      if (password.length < 6 || !(/[a-zA-Z]/.test(password) && /[0-9]/.test(password))) {
        return res.status(400).json({ error: 'Password must be at least 6 characters and contain both letters and numbers.' });
      }
      update.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(
      req.session.userId,
      update,
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      name: user.name || "",
      phone: user.phone
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} body:`, req.body);
  next();
});

// Global error handler (should be after all routes)
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack || err, '\nRequest body:', req.body);
  res.status(500).json({ error: 'Server error (global handler)', details: err.message });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
