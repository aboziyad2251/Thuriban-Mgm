const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Supabase client ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Session store (in-memory — ephemeral by nature) ──────────────
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions    = new Map();

// ── Access levels ─────────────────────────────────────────────────
const ACCESS_LEVEL = {
  CEO: 4, President: 4,
  VicePresident: 3, Advisor: 1, SeniorManager: 3,
  DepartmentManager: 2, Supervisor: 2,
  TeamLeader: 1, DepartmentMember: 1,
};
const levelOf = role => ACCESS_LEVEL[role] || 1;

// ── Hierarchy levels ─────────────────────────────────────────────
const HIERARCHY_LEVELS = [
  { value: 'CEO',               tier: 1, label: 'CEO'                },
  { value: 'President',         tier: 2, label: 'President'          },
  { value: 'VicePresident',     tier: 3, label: 'Vice President'     },
  { value: 'Advisor',           tier: 3, label: 'Advisor'            },
  { value: 'SeniorManager',     tier: 4, label: 'Senior Manager'     },
  { value: 'DepartmentManager', tier: 5, label: 'Department Manager' },
  { value: 'Supervisor',        tier: 6, label: 'Supervisor'         },
  { value: 'TeamLeader',        tier: 7, label: 'Team Leader'        },
  { value: 'DepartmentMember',  tier: 8, label: 'Department Member'  },
];
const tierOf = role => (HIERARCHY_LEVELS.find(l => l.value === role) || { tier: 8 }).tier;

// ── Async wrapper for Express handlers ────────────────────────────
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── JWT Helpers ───────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'thuriban-super-secret-key-123456';

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pads = 4 - (str.length % 4);
  if (pads !== 4) str += '='.repeat(pads);
  return Buffer.from(str, 'base64').toString('utf8');
}

function jwtSign(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, exp: now + 24 * 60 * 60 }; // 24h

  const encHeader = base64urlEncode(JSON.stringify(header));
  const encPayload = base64urlEncode(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encHeader}.${encPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encHeader}.${encPayload}.${signature}`;
}

function jwtVerify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSignature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encHeader}.${encPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (encSignature !== expectedSig) return null;

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encPayload));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;

  return payload;
}

// ── requireAuth ───────────────────────────────────────────────────
const requireAuth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const session = sessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    const { data: member } = await supabase.from('members').select('*').eq('id', session.userId).single();
    if (!member) {
      sessions.delete(token);
      return res.status(401).json({ error: 'Account not found' });
    }

    session.expiresAt = Date.now() + SESSION_TTL;
    req.actor = { ...member, accessLevel: Math.max(levelOf(member.role), levelOf(member.secondaryRole)) };
    return next();
  }

  const payload = jwtVerify(token);
  if (payload) {
    const userId = payload.id;
    const { data: member } = await supabase.from('members').select('*').eq('id', userId).single();
    if (!member) return res.status(401).json({ error: 'Account not found' });

    req.actor = { ...member, accessLevel: Math.max(levelOf(member.role), levelOf(member.secondaryRole)) };
    return next();
  }

  if (session) sessions.delete(token);
  return res.status(401).json({ error: 'Session expired — please log in again' });
});


// ── requireLevel ──────────────────────────────────────────────────
function requireLevel(n) {
  return (req, res, next) => {
    if (req.actor.accessLevel < n)
      return res.status(403).json({
        error: `Access denied — this action requires Level ${n}. You have Level ${req.actor.accessLevel}.`
      });
    next();
  };
}

// ── deptScope ─────────────────────────────────────────────────────
const deptScope = wrap(async (req, res, next) => {
  if (req.actor.accessLevel >= 4) return next();

  const targetId = req.params.id ? parseInt(req.params.id) : null;
  if (targetId) {
    const { data: target } = await supabase.from('members').select('departmentId').eq('id', targetId).single();
    if (target && target.departmentId && target.departmentId !== req.actor.departmentId)
      return res.status(403).json({ error: 'Access denied — target member is outside your department' });
  }

  const bodyDept = req.body && req.body.departmentId;
  if (bodyDept && bodyDept !== req.actor.departmentId)
    return res.status(403).json({ error: 'Access denied — cannot place members in another department' });

  next();
});

// ── protectRoleAssignment ─────────────────────────────────────────
function protectRoleAssignment(req, res, next) {
  if (!req.body) return next();
  const check = (role, label) => {
    if (!role) return null;
    const lvl = levelOf(role);
    if (lvl >= 4 && req.actor.accessLevel < 4) return `Only Level 4 (CEO/President) can assign Level 4 roles (${label})`;
    if (lvl > req.actor.accessLevel) return `Cannot assign a role above your own access level (${label})`;
    return null;
  };
  const err = check(req.body.role, 'primary') || check(req.body.secondaryRole, 'secondary');
  if (err) return res.status(403).json({ error: err });
  next();
}

// ── Dept helper ───────────────────────────────────────────────────
async function getOrCreateDepartmentId(deptName) {
  if (!deptName) return null;
  const trimmed = deptName.trim();
  const { data: existing } = await supabase.from('departments').select('id').ilike('name', trimmed).single();
  if (existing) return existing.id;
  const { data: all } = await supabase.from('departments').select('id');
  const newId = 'dept-' + ((all || []).length + 1);
  await supabase.from('departments').insert({ id: newId, name: trimmed, description: trimmed + ' Department', level: 1, parentId: 'dept-1' });
  return newId;
}

// ── Hierarchy validation ──────────────────────────────────────────
async function validateHierarchy(role, reportsToId) {
  if (!reportsToId) return null;
  const { data: supervisor } = await supabase.from('members').select('role').eq('id', reportsToId).single();
  if (!supervisor) return 'Supervisor not found';
  if (tierOf(supervisor.role) >= tierOf(role))
    return `A ${role} must report to a higher-tier role (cannot report to ${supervisor.role})`;
  return null;
}

// ── Auth ──────────────────────────────────────────────────────────
app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { data: authUser } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();
  if (!authUser) return res.status(401).json({ success: false, message: 'Invalid username or password.' });

  const { data: member } = await supabase.from('members').select('*').eq('id', authUser.memberId).single();
  if (!member) return res.status(500).json({ success: false, message: 'Member record not found.' });

  const token = crypto.randomUUID();
  sessions.set(token, { userId: member.id, expiresAt: Date.now() + SESSION_TTL });

  res.json({
    success: true,
    token,
    user: {
      id:            member.id,
      username:      authUser.username,
      name:          member.name,
      role:          member.role,
      secondaryRole: member.secondaryRole || null,
      accessLevel:   Math.max(levelOf(member.role), levelOf(member.secondaryRole)),
      departmentId:  member.departmentId,
    },
  });
}));

// ── Google OAuth Route ────────────────────────────────────────────
app.post('/api/auth/google', wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'Missing Google token' });

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
  if (!response.ok) return res.status(401).json({ error: 'Invalid Google token' });

  const data = await response.json();
  if (!data.email || (data.email_verified !== 'true' && data.email_verified !== true)) {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const email = data.email;

  const { data: member, error } = await supabase.from('members').select('*').eq('email', email).single();
  if (error || !member) {
    return res.status(401).json({ error: 'Not Authorized' });
  }

  const user = {
    id: member.id,
    name: member.name,
    role: member.role,
    secondaryRole: member.secondaryRole,
    accessLevel: Math.max(levelOf(member.role), levelOf(member.secondaryRole)),
    departmentId: member.departmentId,
  };

  const jwtToken = jwtSign(user);

  sessions.set(jwtToken, { userId: member.id, expiresAt: Date.now() + SESSION_TTL });

  return res.json({ success: true, token: jwtToken, user });
}));

// ── Seed User Endpoint ────────────────────────────────────────────
app.post('/api/admin/seed-user', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const { name, email, department, accessLevel, username, password } = req.body || {};

  // Validate required fields
  if (!name || !name.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const numericLevel = Number(accessLevel);
  if (isNaN(numericLevel) || ![1, 2, 3, 4].includes(numericLevel)) {
    return res.status(400).json({ error: 'Invalid access level' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check email uniqueness
  const { data: existingMember } = await supabase
    .from('members')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingMember) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const finalUsername = (username && username.trim()) ? username.trim() : normalizedEmail.split('@')[0].trim().toLowerCase();
  const finalPassword = (password && password.trim()) ? password.trim() : 'Pass123';

  // Check username uniqueness
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('username', finalUsername)
    .maybeSingle();

  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  // Resolve department
  const departmentId = department ? await getOrCreateDepartmentId(department.trim()) : null;

  // Map access level to role and title
  let role, title;
  switch (numericLevel) {
    case 4:
      role = 'CEO';
      title = 'Chief Executive Officer';
      break;
    case 3:
      role = 'SeniorManager';
      title = 'Senior Manager';
      break;
    case 2:
      role = 'DepartmentManager';
      title = 'Department Manager';
      break;
    case 1:
      role = 'DepartmentMember';
      title = 'Member';
      break;
    default:
      return res.status(400).json({ error: 'Invalid access level' });
  }

  const joinDate = new Date().toISOString().split('T')[0];

  // Insert member
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      role,
      status: 'Active',
      joinDate,
      departmentId,
      title
    })
    .select()
    .single();

  if (memberErr) {
    return res.status(500).json({ error: memberErr.message });
  }

  // Insert user
  const { error: userErr } = await supabase
    .from('users')
    .insert({
      username: finalUsername,
      password: finalPassword,
      memberId: member.id
    });

  if (userErr) {
    // Rollback member
    await supabase.from('members').delete().eq('id', member.id);
    return res.status(500).json({ error: userErr.message });
  }

  return res.status(201).json({
    success: true,
    member,
    username: finalUsername,
    password: finalPassword
  });
}));

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete((req.headers.authorization || '').slice(7));
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    id:           req.actor.id,
    name:         req.actor.name,
    role:         req.actor.role,
    accessLevel:  req.actor.accessLevel,
    departmentId: req.actor.departmentId,
  });
});

// ── Hierarchy levels ─────────────────────────────────────────────
app.get('/api/hierarchy-levels', requireAuth, (_req, res) => res.json(HIERARCHY_LEVELS));

// ── Departments ──────────────────────────────────────────────────
app.get('/api/departments', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('departments').select('*').order('level');
  res.json(data || []);
}));

// ── Stats ────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, wrap(async (_req, res) => {
  const [{ data: members }, { data: tasks }, { count: totalMessages }] = await Promise.all([
    supabase.from('members').select('id, status'),
    supabase.from('tasks').select('id, status'),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
  ]);
  res.json({
    totalMembers:    (members || []).length,
    activeMembers:   (members || []).filter(m => m.status === 'Active').length,
    totalTasks:      (tasks || []).length,
    completedTasks:  (tasks || []).filter(t => t.status === 'done').length,
    inProgressTasks: (tasks || []).filter(t => t.status === 'inprogress').length,
    pendingTasks:    (tasks || []).filter(t => t.status === 'todo').length,
    totalMessages:   totalMessages || 0,
  });
}));

// ── Dashboard ────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, wrap(async (_req, res) => {
  const [{ data: allMembers }, { data: allTasks }, { count: totalMessages }, { data: recentMembers }, { data: recentTasks }, { data: news }] = await Promise.all([
    supabase.from('members').select('id, status'),
    supabase.from('tasks').select('id, status'),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('members').select('*').order('id', { ascending: false }).limit(5),
    supabase.from('tasks').select('*').order('id', { ascending: false }).limit(5),
    supabase.from('news').select('*').eq('status', 'approved').order('id', { ascending: false }),
  ]);
  res.json({
    stats: {
      totalMembers:    (allMembers || []).length,
      activeMembers:   (allMembers || []).filter(m => m.status === 'Active').length,
      totalTasks:      (allTasks || []).length,
      completedTasks:  (allTasks || []).filter(t => t.status === 'done').length,
      inProgressTasks: (allTasks || []).filter(t => t.status === 'inprogress').length,
      pendingTasks:    (allTasks || []).filter(t => t.status === 'todo').length,
      totalMessages:   totalMessages || 0,
    },
    recentMembers: recentMembers || [],
    recentTasks:   recentTasks   || [],
    news:          news          || [],
  });
}));

// ── Eligible supervisors (must be before /api/members/:id) ───────
app.get('/api/members/eligible-managers', requireAuth, wrap(async (req, res) => {
  const role = req.query.role || 'DepartmentMember';
  const myTier = tierOf(role);
  const { data: members } = await supabase.from('members').select('id, name, role, departmentId');
  res.json((members || []).filter(m => tierOf(m.role) < myTier));
}));

// ── Org chart ────────────────────────────────────────────────────
app.get('/api/org-chart', requireAuth, wrap(async (_req, res) => {
  const [{ data: allMembers }, { data: depts }] = await Promise.all([
    supabase.from('members').select('*'),
    supabase.from('departments').select('id, name, nameAr'),
  ]);

  // Exclude system accounts (e.g. the "admin" superuser) from the org chart
  const members = (allMembers || []).filter(m => !m.isSystemAccount);

  const departmentMap   = new Map((depts || []).map(d => [d.id, d.name]));
  const departmentMapAr = new Map((depts || []).map(d => [d.id, d.nameAr || d.name]));
  const memberMap     = new Map(members.map(m => [m.id, m]));
  const childrenOf    = new Map();

  for (const m of members) {
    const key = m.reportsToId || '__root__';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(m.id);
  }

  const root = members.find(m => m.reportsToId === null) || members[0];

  function buildNode(m) {
    if (!m) return null;
    return {
      id:            m.id.toString(),
      name:          m.name,
      title:         m.title || (HIERARCHY_LEVELS.find(l => l.value === m.role) || {}).label || m.role,
      role:          m.role,
      secondaryRole: m.secondaryRole || null,
      email:         m.email,
      phone:         m.phone,
      department:    m.departmentId ? (departmentMap.get(m.departmentId) || m.departmentId) : null,
      departmentAr:  m.departmentId ? (departmentMapAr.get(m.departmentId) || null) : null,
      departmentId:  m.departmentId,
      children:      (childrenOf.get(m.id) || []).map(cid => buildNode(memberMap.get(cid))).filter(Boolean),
    };
  }

  res.json(buildNode(root));
}));

app.put('/api/org-chart', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const tree = req.body;
  if (!tree || !tree.id || !tree.name) return res.status(400).json({ error: 'Invalid org chart structure.' });

  const { data: depts } = await supabase.from('departments').select('id, name');
  const deptByName = new Map((depts || []).map(d => [d.name.toLowerCase(), d.id]));
  const flatMembers = [];

  async function flatten(node, parentId = null) {
    let role = node.role || 'DepartmentMember';
    if (!HIERARCHY_LEVELS.find(l => l.value === role)) role = 'DepartmentMember';

    let departmentId = node.departmentId || null;
    if (node.department && !departmentId) {
      const key = node.department.trim().toLowerCase();
      departmentId = deptByName.get(key) || await getOrCreateDepartmentId(node.department);
      deptByName.set(key, departmentId);
    }

    const id = parseInt(node.id);
    flatMembers.push({
      ...(isNaN(id) ? {} : { id }),
      name: node.name, email: node.email || '', phone: node.phone || '',
      role, status: node.status || 'Active',
      joinDate: node.joinDate || new Date().toISOString().split('T')[0],
      departmentId, reportsToId: parentId,
    });

    for (const child of (node.children || [])) await flatten(child, isNaN(id) ? null : id);
  }

  await flatten(tree, null);
  await supabase.from('members').delete().neq('id', 0);
  const { error } = await supabase.from('members').insert(flatMembers);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
}));

// Drag-and-drop rearrange: move a member under a new parent
app.patch('/api/members/:id/reparent', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const memberId  = parseInt(req.params.id);
  const newParent = req.body.reportsToId ? parseInt(req.body.reportsToId) : null;
  if (memberId === newParent) return res.status(400).json({ error: 'Cannot make a member report to themselves.' });
  const { error } = await supabase.from('members').update({ reportsToId: newParent }).eq('id', memberId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
}));

// ── Members ──────────────────────────────────────────────────────
app.get('/api/members', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('members').select('*').order('id');
  res.json(data || []);
}));

app.post('/api/members', requireAuth, requireLevel(2), deptScope, protectRoleAssignment, wrap(async (req, res) => {
  const body = req.body;
  let role = body.role || 'DepartmentMember';
  if (!HIERARCHY_LEVELS.find(l => l.value === role)) role = 'DepartmentMember';
  let secondaryRole = body.secondaryRole || null;
  if (secondaryRole && !HIERARCHY_LEVELS.find(l => l.value === secondaryRole)) secondaryRole = null;
  const rtoId = body.reportsToId ? parseInt(body.reportsToId) : null;
  const err = await validateHierarchy(role, rtoId);
  if (err) return res.status(400).json({ error: err });
  let departmentId = body.departmentId || (body.department ? await getOrCreateDepartmentId(body.department) : null);

  const { data, error } = await supabase.from('members').insert({
    name: body.name, email: body.email || '', phone: body.phone || '',
    role, secondaryRole, status: body.status || 'Active',
    joinDate: new Date().toISOString().split('T')[0],
    departmentId: departmentId || null, reportsToId: rtoId, title: body.title || '',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

app.put('/api/members/:id', requireAuth, requireLevel(2), deptScope, protectRoleAssignment, wrap(async (req, res) => {
  const id = parseInt(req.params.id);
  const { data: existing } = await supabase.from('members').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const body = req.body;
  let role = body.role || existing.role;
  if (!HIERARCHY_LEVELS.find(l => l.value === role)) role = existing.role;
  let secondaryRole = 'secondaryRole' in body ? (body.secondaryRole || null) : (existing.secondaryRole || null);
  if (secondaryRole && !HIERARCHY_LEVELS.find(l => l.value === secondaryRole)) secondaryRole = null;
  const rtoId = body.reportsToId !== undefined
    ? (body.reportsToId ? parseInt(body.reportsToId) : null)
    : existing.reportsToId;
  const err = await validateHierarchy(role, rtoId);
  if (err) return res.status(400).json({ error: err });
  let departmentId = body.departmentId !== undefined ? body.departmentId : existing.departmentId;
  if (!departmentId && body.department) departmentId = await getOrCreateDepartmentId(body.department);

  const { id: _id, ...rest } = body;
  const { data, error } = await supabase.from('members')
    .update({ ...rest, role, secondaryRole, reportsToId: rtoId, departmentId })
    .eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

app.delete('/api/members/:id', requireAuth, requireLevel(2), deptScope, wrap(async (req, res) => {
  const memberId = parseInt(req.params.id);
  const { data: target } = await supabase.from('members').select('reportsToId').eq('id', memberId).single();
  if (!target) return res.status(404).json({ error: 'Member not found' });

  // Delete user accounts linked to a member (FK constraint: users.memberId → members.id)
  async function deleteUserAndMember(mid) {
    await supabase.from('users').delete().eq('memberId', mid);
    await supabase.from('members').delete().eq('id', mid);
  }

  if (req.query.promote === 'true') {
    await supabase.from('members').update({ reportsToId: target.reportsToId }).eq('reportsToId', memberId);
  } else {
    async function deleteSubtree(pid) {
      const { data: children } = await supabase.from('members').select('id').eq('reportsToId', pid);
      for (const c of (children || [])) { await deleteSubtree(c.id); await deleteUserAndMember(c.id); }
    }
    await deleteSubtree(memberId);
  }
  await deleteUserAndMember(memberId);
  res.json({ success: true });
}));

// ── Tasks ────────────────────────────────────────────────────────
app.get('/api/tasks', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('tasks').select('*').order('id');
  res.json(data || []);
}));

app.post('/api/tasks', requireAuth, requireLevel(2), wrap(async (req, res) => {
  const { data, error } = await supabase.from('tasks').insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

app.put('/api/tasks/:id', requireAuth, requireLevel(2), wrap(async (req, res) => {
  const { data, error } = await supabase.from('tasks').update(req.body).eq('id', parseInt(req.params.id)).select().single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
}));

app.delete('/api/tasks/:id', requireAuth, requireLevel(3), wrap(async (req, res) => {
  await supabase.from('tasks').delete().eq('id', parseInt(req.params.id));
  res.json({ success: true });
}));

// ── Messages ─────────────────────────────────────────────────────
app.get('/api/messages', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('messages').select('*').order('id');
  res.json(data || []);
}));

app.post('/api/messages', requireAuth, wrap(async (req, res) => {
  const { data, error } = await supabase.from('messages').insert({
    ...req.body,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toISOString().split('T')[0],
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

// ── Channels ─────────────────────────────────────────────────────
app.get('/api/channels', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('channels').select('*').order('id');
  res.json(data || []);
}));

app.post('/api/channels', requireAuth, requireLevel(3), wrap(async (req, res) => {
  const { name, icon } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Channel name is required' });
  const { data: last } = await supabase.from('channels').select('id').order('id', { ascending: false }).limit(1);
  const lastNum = last && last.length ? parseInt((last[0].id || 'ch-0').replace('ch-', '')) : 0;
  const { data, error } = await supabase.from('channels').insert({
    id:           `ch-${lastNum + 1}`,
    name:         name.trim(),
    icon:         icon || 'fa-hashtag',
    departmentId: req.actor.accessLevel >= 4 ? (req.body.departmentId || null) : req.actor.departmentId,
    createdBy:    req.actor.id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

// ── News ─────────────────────────────────────────────────────────
app.get('/api/news', requireAuth, wrap(async (_req, res) => {
  const { data } = await supabase.from('news').select('*').eq('status', 'approved').order('id', { ascending: false });
  res.json(data || []);
}));

app.get('/api/news/pending', requireAuth, requireLevel(4), wrap(async (_req, res) => {
  const { data } = await supabase.from('news').select('*').eq('status', 'pending').order('id', { ascending: false });
  res.json(data || []);
}));

app.post('/api/news', requireAuth, wrap(async (req, res) => {
  const status = req.actor.accessLevel >= 4 ? 'approved' : 'pending';
  const { data, error } = await supabase.from('news').insert({
    ...req.body,
    author: req.body.author || req.actor.name,
    date: new Date().toISOString().split('T')[0],
    tags: req.body.tags || ['Notice'],
    status,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

app.patch('/api/news/:id/approve', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const { data, error } = await supabase.from('news')
    .update({ status: 'approved' })
    .eq('id', parseInt(req.params.id)).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

app.patch('/api/news/:id/reject', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const { data, error } = await supabase.from('news')
    .update({ status: 'rejected' })
    .eq('id', parseInt(req.params.id)).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

app.delete('/api/news/:id', requireAuth, requireLevel(4), wrap(async (req, res) => {
  await supabase.from('news').delete().eq('id', parseInt(req.params.id));
  res.json({ success: true });
}));

// ── Documents ────────────────────────────────────────────────────
app.get('/api/documents', requireAuth, wrap(async (req, res) => {
  const { data } = await supabase.from('documents').select('*')
    .lte('minAccessLevel', req.actor.accessLevel).order('id');
  res.json(data || []);
}));

app.post('/api/documents', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const { title, description, filename, url, minAccessLevel } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  const { data, error } = await supabase.from('documents').insert({
    title: title.trim(),
    description: (description || '').trim(),
    filename:    (filename    || '').trim(),
    url:         (url         || '').trim(),
    uploadedBy:  req.actor.name,
    uploadedAt:  new Date().toISOString().split('T')[0],
    minAccessLevel: Math.min(4, Math.max(1, parseInt(minAccessLevel) || 1)),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

app.put('/api/documents/:id/access', requireAuth, requireLevel(4), wrap(async (req, res) => {
  const { data, error } = await supabase.from('documents')
    .update({ minAccessLevel: Math.min(4, Math.max(1, parseInt(req.body.minAccessLevel) || 1)) })
    .eq('id', parseInt(req.params.id)).select().single();
  if (error) return res.status(404).json({ error: 'Document not found' });
  res.json(data);
}));

app.delete('/api/documents/:id', requireAuth, requireLevel(4), wrap(async (req, res) => {
  await supabase.from('documents').delete().eq('id', parseInt(req.params.id));
  res.json({ success: true });
}));

// ── Global error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n  Thuriban Club Mgm  |  http://localhost:${PORT}\n`));
