// ═══════════════════════════════════════════════════════════════════
//  هيكلة المشروع — Org Infographic Component
//  Edit this file to change the infographic layout, labels, and icons.
//  Changes here are reflected immediately after server restart.
// ═══════════════════════════════════════════════════════════════════

// ── Config ──────────────────────────────────────────────────────────
// Club identity shown in the header
const INF_CLUB_NAME = 'نادي ثريبان الرياضي الاجتماعي';
const INF_CLUB_YEAR = '2022';
const INF_TITLE_LINE1 = 'الهيكلة التنظيمية';
const INF_TITLE_LINE2 = 'لمشروع التحول والتطوير المؤسسي';
const INF_TITLE_LINE3 = 'لنادي ثريبان الرياضي الاجتماعي';

// Chairman box subtitle & description
const INF_CHAIRMAN_BADGE = 'رئيس مجلس الإدارة ومنسق مشروع التحول';
const INF_CHAIRMAN_DESC = 'الإشراف العام على الإدارتين والتكامل بينهما';

// Column headers
const INF_COL_BOARD_LABEL = 'أولاً: مجلس إدارة نادي ثريبان الرياضي الاجتماعي';
const INF_COL_PROJECTS_LABEL = 'ثانياً: إدارة المشاريع والدعم الفني';
const INF_SHARED_LABEL = 'الأعضاء المشتركون بين الإدارتين';

// Footer
const INF_FOOTER_TAGLINE = 'مع مجتمعنا نحو الريادة';
const INF_FOOTER_BODY = 'لضمان التكامل بين العمل الرياضي والمشاريع التطويرية وتحقيق مستهدفات التحول المؤسسي.';
const INF_FOOTER_SUB = 'مشروع التحول والتطوير المؤسسي — نادي ثريبان الرياضي الاجتماعي';

// ── Classification logic ─────────────────────────────────────────────
// Members filtered OUT of both columns (placeholders / system accounts)
function infIsReal(m) {
  return m.name && m.name !== 'شاغر' && m.name !== 'Administrator';
}

// Board column  →  operational roles (non-advisor)
function infIsBoard(m) {
  return m.role !== 'CEO'
    && m.role !== 'Advisor'
    && m.secondaryRole !== 'Advisor'
    && infIsReal(m);
}

// Projects column  →  advisors + dual-role (SeniorManager+Advisor)
function infIsProject(m) {
  return (m.role === 'Advisor' || m.secondaryRole === 'Advisor') && infIsReal(m);
}

// Shared center  →  CEO + VicePresident appear in both columns
function infIsShared(m) {
  return (m.role === 'CEO' || m.role === 'VicePresident') && infIsReal(m);
}

// ── Icon map ─────────────────────────────────────────────────────────
// Font Awesome 6 solid icon for each member — tweak per dept/role here
function infGetIcon(m) {
  if (m.role === 'CEO') return 'fa-user-tie';
  if (m.role === 'VicePresident') return 'fa-user';
  if (m.departmentId === 'dept-3') return 'fa-handshake';
  if (m.departmentId === 'dept-4') return 'fa-chart-line';
  if (m.departmentId === 'dept-5') return 'fa-briefcase';
  if (m.departmentId === 'dept-6') return m.role === 'DepartmentManager' ? 'fa-users' : 'fa-futbol';
  if (m.departmentId === 'dept-7') return 'fa-bullhorn';
  if (m.departmentId === 'dept-8') return 'fa-camera';
  if (m.departmentId === 'dept-2') {
    // Health consultant detected by name prefix دكتور / رامي
    if (m.name && (m.name.includes('رامي') || m.name.includes('دكتور'))) return 'fa-heart-pulse';
    return 'fa-helmet-safety';
  }
  return 'fa-building';
}

// ── Title map ────────────────────────────────────────────────────────
// Arabic role subtitle shown under each member's name
function infGetTitle(m) {
  if (m.role === 'CEO') return 'رئيس مجلس الإدارة';
  if (m.role === 'VicePresident') return 'نائب الرئيس';
  if (m.role === 'Advisor' || m.secondaryRole === 'Advisor') {
    if (m.departmentId === 'dept-5') return 'مدير المشروع';
    if (m.name && (m.name.includes('رامي') || m.name.includes('دكتور'))) return 'مستشار صحي وتوثيق رياضي';
    return 'مستشار هندسي';
  }
  const byDept = {
    'dept-3': 'مدير العلاقات العامة',
    'dept-4': 'المدير المالي',
    'dept-7': 'مدير الإعلام والاتصال',
    'dept-8': 'مدير العلاقات والتصوير والمونتاج',
  };
  if (m.departmentId === 'dept-6') return m.role === 'DepartmentManager' ? 'رئيس رابطة المشجعين' : 'المدرب الفني';
  return byDept[m.departmentId] || m.role;
}

// ── MemberCard sub-component ─────────────────────────────────────────
function InfMemberCard({ m, index }) {
  return (
    <div className="org-info-member-card">
      <div className="org-info-member-num">{index + 1}</div>
      <div className="org-info-member-body">
        <div className="org-info-member-name">{m.name}</div>
        <div className="org-info-member-roles">
          <span>• {infGetTitle(m)}</span>
        </div>
      </div>
      <div className="org-info-member-icon">
        <i className={`fa-solid ${infGetIcon(m)}`}></i>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
function OrgInfographic({ members }) {
  const chairman = members.find(m => m.role === 'CEO' && infIsReal(m))
    || { id: 0, name: 'رئيس مجلس الإدارة', role: 'CEO', departmentId: 'dept-1' };

  const board = members
    .filter(infIsBoard)
    .sort((a, b) => {
      if (a.role === 'VicePresident') return -1;
      if (b.role === 'VicePresident') return 1;
      return a.id - b.id;
    });

  const projects = members
    .filter(infIsProject)
    .sort((a, b) => a.id - b.id);

  const shared = members.filter(infIsShared);

  return (
    <div className="org-infographic-container">

      {/* ── Header ── */}
      <div className="org-infographic-header">
        <div className="org-infographic-logo-badge">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>KSA</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>2034</div>
          </div>
        </div>

        <div className="org-infographic-title-block">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(201,162,39,0.15)', border: '2px solid #C9A227', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#C9A227' }}>
              <i className="fa-solid fa-futbol"></i>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="org-infographic-club-name">{INF_CLUB_NAME}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: "'Cairo',sans-serif" }}>
                THURIBAN CLUB • {INF_CLUB_YEAR}
              </div>
            </div>
          </div>
          <div className="org-infographic-main-title">
            {INF_TITLE_LINE1}<br />
            {INF_TITLE_LINE2}<br />
            <span style={{ fontSize: 16 }}>{INF_TITLE_LINE3}</span>
          </div>
        </div>

        <div className="org-infographic-logo-badge">
          <span style={{ fontSize: 9, lineHeight: 1.5 }}>جمعية التنمية الأهلية بالعرضية الجنوبية</span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="org-infographic-divider">
        <div className="org-infographic-divider-line"></div>
        <i className="fa-solid fa-star"></i>
        <div className="org-infographic-divider-line"></div>
        <i className="fa-solid fa-star"></i>
        <div className="org-infographic-divider-line"></div>
      </div>

      {/* ── Chairman ── */}
      <div className="org-chairman-wrap">
        <div className="org-chairman-box">
          <div className="org-chairman-avatar">
            <i className="fa-solid fa-user-tie"></i>
          </div>
          <div className="org-chairman-name">{chairman.name}</div>
          <div className="org-chairman-role-badge">{INF_CHAIRMAN_BADGE}</div>
          <div className="org-chairman-desc">{INF_CHAIRMAN_DESC}</div>
        </div>
      </div>

      {/* ── Body: two columns + shared center ── */}
      <div className="org-infographic-body">

        {/* Board column */}
        <div>
          <div className="org-col-header">
            <div className="org-col-icon"><i className="fa-solid fa-people-group"></i></div>
            <h3>{INF_COL_BOARD_LABEL}</h3>
          </div>
          {board.map((m, i) => <InfMemberCard key={m.id} m={m} index={i} />)}
        </div>

        {/* Shared center */}
        <div className="org-shared-center">
          <div className="org-shared-arrow"></div>
          <div className="org-shared-box">
            <h4>{INF_SHARED_LABEL}</h4>
            {shared.map(m => (
              <div key={m.id} className="org-shared-member">{m.name}</div>
            ))}
          </div>
          <div className="org-shared-arrow-down"></div>
        </div>

        {/* Projects column */}
        <div>
          <div className="org-col-header">
            <div className="org-col-icon"><i className="fa-solid fa-gear"></i></div>
            <h3>{INF_COL_PROJECTS_LABEL}</h3>
          </div>
          {projects.map((m, i) => <InfMemberCard key={m.id} m={m} index={i} />)}
        </div>

      </div>

      {/* ── Footer ── */}
      <div className="org-infographic-divider" style={{ marginTop: 20 }}>
        <div className="org-infographic-divider-line"></div>
        <i className="fa-solid fa-circle-dot"></i>
        <div className="org-infographic-divider-line"></div>
      </div>
      <div className="org-infographic-footer">
        <div className="org-infographic-footer-tagline">{INF_FOOTER_TAGLINE}</div>
        <p>{INF_FOOTER_BODY}</p>
        <p style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{INF_FOOTER_SUB}</p>
      </div>

    </div>
  );
}
