const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Users (auth) ────────────────────────────────────────────────
const users = [
  { id: 1, username: 'admin',   password: 'admin123',   name: 'Aung Kyaw', role: 'Administrator' },
  { id: 2, username: 'manager', password: 'manager123', name: 'Su Su',     role: 'Manager'       },
  { id: 3, username: 'aung',    password: 'aung123',    name: 'Aung Kyaw', role: 'Member'        },
];

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  const { password: _pw, ...safe } = user;
  res.json({ success: true, user: safe });
});

// ── Departments ──────────────────────────────────────────────────
const departments = [
  { id: 'dept-1', name: 'Executive Management', description: 'Board and executive leadership', level: 0, parentId: null },
  { id: 'dept-2', name: 'Board',                description: 'Board of directors',             level: 1, parentId: 'dept-1' },
  { id: 'dept-3', name: 'Administration & HR',  description: 'HR, compliance, admin ops',      level: 1, parentId: 'dept-1' },
  { id: 'dept-4', name: 'Finance & Procurement',description: 'Finance, budget, procurement',   level: 1, parentId: 'dept-1' },
  { id: 'dept-5', name: 'IT & Digital Systems', description: 'Technology and digital ops',     level: 1, parentId: 'dept-1' },
  { id: 'dept-6', name: 'Programs & Activities',description: 'Club programs and events',       level: 1, parentId: 'dept-1' },
  { id: 'dept-7', name: 'Marketing & PR',       description: 'Comms, branding, outreach',      level: 1, parentId: 'dept-1' },
];
const departmentMap = new Map(departments.map(d => [d.id, d.name]));

// ── In-memory data ──────────────────────────────────────────────
let members = [
  { id: 1, name: 'Aung Kyaw', email: 'aung@thuriban.com',    phone: '+95 9 123 456 789', role: 'Admin',   status: 'Active',   joinDate: '2024-01-15', departmentId: 'dept-1', reportsToId: null },
  { id: 2, name: 'Nay Lin',   email: 'naylin@thuriban.com',  phone: '+95 9 987 654 321', role: 'Member',  status: 'Active',   joinDate: '2024-02-20', departmentId: 'dept-6', reportsToId: 3    },
  { id: 3, name: 'Su Su',     email: 'susu@thuriban.com',    phone: '+95 9 456 789 123', role: 'Manager', status: 'Active',   joinDate: '2024-03-10', departmentId: 'dept-3', reportsToId: 1    },
  { id: 4, name: 'Kyaw Zin',  email: 'kyawzin@thuriban.com', phone: '+95 9 321 654 987', role: 'Member',  status: 'Inactive', joinDate: '2024-04-05', departmentId: 'dept-4', reportsToId: 1    },
  { id: 5, name: 'Mya Mya',   email: 'myamya@thuriban.com',  phone: '+95 9 654 321 789', role: 'Member',  status: 'Active',   joinDate: '2024-05-12', departmentId: 'dept-6', reportsToId: 3    },
  { id: 6, name: 'Zaw Win',   email: 'zawwin@thuriban.com',  phone: '+95 9 111 222 333', role: 'Member',  status: 'Active',   joinDate: '2025-01-08', departmentId: 'dept-7', reportsToId: 1    },
];

let tasks = [
  { id: 1, title: 'Club Annual Meeting',       description: 'Prepare agenda and materials',        status: 'todo',       priority: 'High',   assignee: 'Aung Kyaw', dueDate: '2026-06-15' },
  { id: 2, title: 'Membership Drive Campaign', description: 'Design and run recruitment campaign', status: 'inprogress', priority: 'Medium', assignee: 'Su Su',     dueDate: '2026-06-20' },
  { id: 3, title: 'Update Club Website',       description: 'Refresh content and photos',          status: 'inprogress', priority: 'Low',    assignee: 'Nay Lin',   dueDate: '2026-06-25' },
  { id: 4, title: 'Financial Report Q1',       description: 'Prepare quarterly financial summary', status: 'done',       priority: 'High',   assignee: 'Kyaw Zin',  dueDate: '2026-05-30' },
  { id: 5, title: 'Sports Event Planning',     description: 'Organize the annual sports day',      status: 'todo',       priority: 'Medium', assignee: 'Mya Mya',   dueDate: '2026-07-01' },
  { id: 6, title: 'Club Newsletter',           description: 'Write and distribute monthly letter', status: 'done',       priority: 'Low',    assignee: 'Zaw Win',   dueDate: '2026-05-20' },
];

let messages = [
  { id: 1, sender: 'Aung Kyaw', avatar: 'AK', text: "Good morning everyone! Ready for today's meeting?",     time: '09:00 AM', date: '2026-06-07' },
  { id: 2, sender: 'Su Su',     avatar: 'SS', text: "Yes! I've prepared the slides for the presentation.",    time: '09:05 AM', date: '2026-06-07' },
  { id: 3, sender: 'Nay Lin',   avatar: 'NL', text: 'The venue is confirmed. See you all at 10 AM!',         time: '09:10 AM', date: '2026-06-07' },
  { id: 4, sender: 'Mya Mya',   avatar: 'MM', text: "Don't forget to bring your membership cards.",          time: '09:15 AM', date: '2026-06-07' },
  { id: 5, sender: 'Zaw Win',   avatar: 'ZW', text: 'Will the sports day schedule be shared beforehand?',    time: '09:22 AM', date: '2026-06-07' },
];

let news = [
  { id: 1, title: 'Annual Club Upgrade Planning',    content: 'Our team is upgrading the Enterprise Management System with RBAC, Org Chart, and Document Management features.', author: 'Aung Kyaw', date: '2026-06-08', tags: ['System', 'Notice'] },
  { id: 2, title: 'New Membership Campaign Launch',  content: 'The club is launching a new recruitment drive this summer. Reach out to Su Su for registration spec details.',   author: 'Su Su',     date: '2026-06-05', tags: ['Campaign'] },
  { id: 3, title: 'Quarterly Audit Completed',       content: 'We successfully concluded our Q1 financial review with the leadership committee. Thanks to Kyaw Zin for compilation.', author: 'Kyaw Zin', date: '2026-06-01', tags: ['Audit', 'Finance'] },
];

let nextMemberId  = 7;
let nextTaskId    = 7;
let nextMessageId = 6;
let nextNewsId    = 4;

// ── Hierarchy validation helper ──────────────────────────────────
function validateHierarchy(role, reportsToId) {
  if (!reportsToId) return null; // no supervisor = ok (root)
  const supervisor = members.find(m => m.id == reportsToId);
  if (!supervisor) return 'Supervisor not found';
  if (role === 'Member') {
    if (!['Manager', 'Admin'].includes(supervisor.role))
      return 'Members must report to a Manager or Admin';
  }
  if (role === 'Manager') {
    if (supervisor.role !== 'Admin')
      return 'Managers must report to an Admin / Executive';
  }
  return null; // Admin: no constraint
}

// ── Stats ────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json({
    totalMembers:    members.length,
    activeMembers:   members.filter(m => m.status === 'Active').length,
    totalTasks:      tasks.length,
    completedTasks:  tasks.filter(t => t.status === 'done').length,
    inProgressTasks: tasks.filter(t => t.status === 'inprogress').length,
    pendingTasks:    tasks.filter(t => t.status === 'todo').length,
    totalMessages:   messages.length,
  });
});

// ── Dashboard ────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const recentMembers = [...members].reverse().slice(0, 5);
  const recentTasks   = [...tasks].reverse().slice(0, 5);
  res.json({
    stats: {
      totalMembers:    members.length,
      activeMembers:   members.filter(m => m.status === 'Active').length,
      totalTasks:      tasks.length,
      completedTasks:  tasks.filter(t => t.status === 'done').length,
      inProgressTasks: tasks.filter(t => t.status === 'inprogress').length,
      pendingTasks:    tasks.filter(t => t.status === 'todo').length,
      totalMessages:   messages.length,
    },
    recentMembers,
    recentTasks,
    news,
  });
});

// ── Departments ──────────────────────────────────────────────────
app.get('/api/departments', (req, res) => res.json(departments));

// ── Eligible managers (must be before /api/members/:id) ──────────
app.get('/api/members/eligible-managers', (req, res) => {
  const role = req.query.role;
  let eligible;
  if (role === 'Member') {
    eligible = members.filter(m => m.role === 'Manager' || m.role === 'Admin');
  } else if (role === 'Manager') {
    eligible = members.filter(m => m.role === 'Admin');
  } else {
    eligible = members.filter(m => m.role !== 'Member');
  }
  res.json(eligible.map(m => ({ id: m.id, name: m.name, role: m.role, departmentId: m.departmentId })));
});

// ── Org chart ────────────────────────────────────────────────────
app.get('/api/org-chart', (req, res) => {
  const memberMap  = new Map(members.map(m => [m.id, m]));
  const childrenOf = new Map(); // parentId → child ids
  for (const m of members) {
    const key = m.reportsToId || '__root__';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(m.id);
  }

  const root = members.find(m => m.reportsToId === null) || members.find(m => m.role === 'Admin') || members[0];

  function buildNode(m) {
    const deptName = m.departmentId ? (departmentMap.get(m.departmentId) || m.departmentId) : null;
    return {
      id:             m.id,
      name:           m.name,
      title:          m.role === 'Admin' ? 'President / CEO' : m.role,
      role:           m.role,
      email:          m.email,
      phone:          m.phone,
      department:     deptName,
      departmentId:   m.departmentId,
      children:       (childrenOf.get(m.id) || []).map(cid => buildNode(memberMap.get(cid))).filter(Boolean),
    };
  }

  res.json(buildNode(root));
});

// ── Members ──────────────────────────────────────────────────────
app.get('/api/members', (req, res) => res.json(members));

app.post('/api/members', (req, res) => {
  const body   = req.body;
  const role   = body.role || 'Member';
  const rtoId  = body.reportsToId ? parseInt(body.reportsToId) : null;
  const err    = validateHierarchy(role, rtoId);
  if (err) return res.status(400).json({ error: err });

  const member = {
    id:           nextMemberId++,
    joinDate:     new Date().toISOString().split('T')[0],
    status:       'Active',
    departmentId: null,
    reportsToId:  null,
    ...body,
    role,
    reportsToId: rtoId,
  };
  members.push(member);
  res.status(201).json(member);
});

app.put('/api/members/:id', (req, res) => {
  const idx = members.findIndex(m => m.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const body  = req.body;
  const role  = body.role || members[idx].role;
  const rtoId = body.reportsToId !== undefined
    ? (body.reportsToId ? parseInt(body.reportsToId) : null)
    : members[idx].reportsToId;

  const err = validateHierarchy(role, rtoId);
  if (err) return res.status(400).json({ error: err });

  members[idx] = { ...members[idx], ...body, role, reportsToId: rtoId };
  res.json(members[idx]);
});

app.delete('/api/members/:id', (req, res) => {
  members = members.filter(m => m.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ── Tasks ────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => res.json(tasks));

app.post('/api/tasks', (req, res) => {
  const task = { id: nextTaskId++, ...req.body };
  tasks.push(task);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex(t => t.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx] = { ...tasks[idx], ...req.body };
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter(t => t.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ── Messages ─────────────────────────────────────────────────────
app.get('/api/messages', (req, res) => res.json(messages));

app.post('/api/messages', (req, res) => {
  const msg = {
    id:     nextMessageId++,
    time:   new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    date:   new Date().toISOString().split('T')[0],
    ...req.body,
  };
  messages.push(msg);
  res.status(201).json(msg);
});

// ── News ─────────────────────────────────────────────────────────
app.get('/api/news', (req, res) => res.json(news));

app.post('/api/news', (req, res) => {
  const item = { id: nextNewsId++, date: new Date().toISOString().split('T')[0], tags: req.body.tags || ['Notice'], ...req.body };
  news.unshift(item);
  res.status(201).json(item);
});

app.delete('/api/news/:id', (req, res) => {
  news = news.filter(n => n.id !== parseInt(req.params.id));
  res.json({ success: true });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Thuriban Club Mgm  |  http://localhost:${PORT}\n`);
});
