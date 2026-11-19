import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  ClipboardList,
  FileCheck2,
  FileText,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, CurrentUser, restoreSession, signIn, Workspace, endSession } from "./api";
import { buildConfiguredTemplateImport } from "../App";
import "./admin.css";

type Area = "overview" | "tenants" | "standards" | "platform-audit" | "orders" | "reviews" | "shares" | "members" | "organization" | "templates" | "audit";
type Tenant = {
  id: string;
  name: string;
  code: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  planCode: string;
  expiresAt: string | null;
  seatLimit: number;
  monthlyOrderLimit: number | null;
  createdAt: string;
  _count: { memberships: number; orders: number };
};
type OrganizationProfile = {
  id: string;
  code: string;
  name: string;
  displayName: string;
  reportDisclaimer: string;
  status: string;
  planCode: string;
  expiresAt: string | null;
};
type Member = {
  id: string;
  role: "INSPECTOR" | "ORG_ADMIN";
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  user: { id: string; displayName: string; email: string | null; status: string };
};
type Invitation = {
  id: string;
  email: string | null;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
type AuditEvent = {
  id: string;
  tenantId?: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
};
type ReviewItem = {
  id: string;
  orderNo: string;
  status: string;
  vehicle: { kind: string; brand: string | null; model: string | null; year: number | null; plate: string | null };
  template: { title: string; standardType: string };
  inspector: { displayName: string };
  revision: { id: string; revisionNumber: number; submittedAt: string | null } | null;
};
type StandardRevision = {
  id: string;
  version: string;
  sourceFileName: string | null;
  sourceHash: string | null;
  scope: string;
  approvalRef: string | null;
  approvedAt: string | null;
};
type Standard = {
  id: string;
  code: string;
  title: string;
  owner: string | null;
  licenseRef: string;
  revisions: StandardRevision[];
};

const areaNames: Record<Area, string> = {
  overview: "工作概览",
  tenants: "机构管理",
  standards: "标准审批",
  "platform-audit": "平台审计",
  orders: "检测订单",
  reviews: "待审核队列",
  shares: "报告与分享",
  members: "成员与邀请",
  organization: "机构资料",
  templates: "检测模板",
  audit: "机构审计",
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function dateLabel(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="admin-field"><span>{label}</span>{children}</label>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>, tenantId?: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn(email, password, tenantId);
      if (result.requiresWorkspaceSelection && result.workspaces?.length) {
        setWorkspaces(result.workspaces);
        return;
      }
      if (!result.accessToken) throw new Error("登录成功但未建立会话，请联系管理员。");
      const currentUser = await api<CurrentUser>("/auth/me");
      if (currentUser.platformRole === "NONE") {
        await endSession();
        throw new Error("此后台仅供平台运营使用。检测师和机构管理员请使用鉴见微信小程序。");
      }
      onAuthenticated(currentUser);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <form className="admin-login-card" onSubmit={(event) => void submit(event)}>
        <div className="admin-login-mark"><ShieldCheck size={24} /></div>
        <p className="admin-kicker">INSPECTION STUDIO · ADMIN</p>
        <h1>鉴见管理工作台</h1>
        <p className="admin-muted">此后台仅供平台运营人员登录。检测师和机构管理员请使用「鉴见检测」微信小程序。</p>
        {workspaces.length ? (
          <div className="admin-workspace-picker">
            <strong>选择工作空间</strong>
            {workspaces.map((workspace) => (
              <button key={workspace.id} disabled={busy} onClick={(event) => void submit(event, workspace.id)} type="button">
                <Building2 size={17} /><span>{workspace.name}</span><small>{workspace.role === "ORG_ADMIN" ? "机构管理员" : "检测师"}</small>
              </button>
            ))}
            <button className="admin-text-button" type="button" onClick={() => setWorkspaces([])}>返回登录</button>
          </div>
        ) : (
          <>
            <Field label="邮箱"><input autoComplete="username" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></Field>
            <Field label="密码"><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></Field>
            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
            <button className="admin-button admin-button--primary admin-login-submit" disabled={busy} type="submit">{busy ? "正在验证…" : "安全登录"}</button>
          </>
        )}
        {error && workspaces.length > 0 && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
        <p className="admin-login-note">登录仅适用于拥有密码凭证的账号。检测师微信登录将在独立小程序端提供。</p>
      </form>
    </main>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    document.title = "鉴见管理工作台";
  }, []);

  useEffect(() => {
    let active = true;
    void restoreSession().then((restored) => {
      if (active) setUser(restored);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoadingSession(false);
    });
    return () => { active = false; };
  }, []);

  if (loadingSession) return <div className="admin-loading"><RefreshCw size={18} className="admin-spin" /> 正在恢复安全会话…</div>;
  if (!user) return <LoginScreen onAuthenticated={setUser} />;
  return <Portal user={user} onLogout={async () => { await endSession(); setUser(null); }} />;
}

function Portal({ user, onLogout }: { user: CurrentUser; onLogout: () => Promise<void> }) {
  const isPlatform = user.platformRole !== "NONE";
  const isOrgAdmin = user.memberships.some((membership) => membership.role === "ORG_ADMIN");
  const areas = useMemo<Area[]>(() => isPlatform
    ? ["overview", "tenants", ...(user.platformRole === "SUPER_ADMIN" ? ["standards" as const] : []), "platform-audit"]
    : isOrgAdmin
      ? ["overview", "orders", "reviews", "shares", "templates", "members", "organization", "audit"]
      : ["overview", "orders"], [isOrgAdmin, isPlatform, user.platformRole]);
  const [area, setArea] = useState<Area>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }, []);
  const reload = () => setVersion((value) => value + 1);
  const name = user.displayName || user.email || "管理员";

  if (!isPlatform) {
    return (
      <main className="admin-login">
        <section className="admin-login-card">
          <div className="admin-login-mark"><ShieldCheck size={24} /></div>
          <p className="admin-kicker">INSPECTION STUDIO</p>
          <h1>机构工作台已迁移至微信小程序</h1>
          <p className="admin-muted">检测师和机构管理员请使用「鉴见检测」微信小程序。后台 Web 仅供平台运营人员使用。</p>
          <button className="admin-button admin-button--primary" onClick={() => void run(onLogout)} type="button">退出并返回登录</button>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin"><span className="admin-brand-icon"><ShieldCheck size={20} /></span><span><strong>鉴见</strong><small>ADMIN CONSOLE</small></span></a>
        <div className="admin-sidebar-label">{isPlatform ? "平台运营" : "机构工作台"}</div>
        <nav className="admin-nav" aria-label="管理导航">
          {areas.map((item) => <button className={area === item ? "is-active" : ""} key={item} onClick={() => { setArea(item); setError(""); setNotice(""); }}><NavIcon area={item} />{areaNames[item]}</button>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-user-card"><span className="admin-avatar">{name.slice(0, 1)}</span><span><strong>{name}</strong><small>{isPlatform ? user.platformRole === "SUPER_ADMIN" ? "平台超级管理员" : "平台运营" : user.memberships[0]?.tenant.name}</small></span></div>
          <button className="admin-logout" disabled={busy} onClick={() => void run(onLogout)}><LogOut size={15} />退出登录</button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar"><div><span>鉴见</span><b>/</b><strong>{areaNames[area]}</strong></div><div className="admin-topbar-right"><i />安全连接 <button aria-label="刷新数据" disabled={busy} onClick={reload}><RefreshCw size={15} /></button></div></header>
        <div className="admin-content">
          {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
          {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
          <AreaContent key={`${area}-${version}`} area={area} user={user} isPlatform={isPlatform} run={run} setNotice={setNotice} reload={reload} navigate={setArea} />
        </div>
      </main>
    </div>
  );
}

function NavIcon({ area }: { area: Area }) {
  if (area === "overview") return <Activity size={17} />;
  if (area === "tenants" || area === "organization") return <Building2 size={17} />;
  if (area === "members") return <Users size={17} />;
  if (area === "standards" || area === "templates") return <FileText size={17} />;
  if (area === "reviews") return <FileCheck2 size={17} />;
  if (area === "shares") return <ShieldCheck size={17} />;
  return <ClipboardList size={17} />;
}

function AreaContent({ area, user, isPlatform, run, setNotice, reload, navigate }: {
  area: Area;
  user: CurrentUser;
  isPlatform: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  setNotice: (value: string) => void;
  reload: () => void;
  navigate: (area: Area) => void;
}) {
  if (isPlatform && area === "overview") return <PlatformOverview navigate={navigate} />;
  if (area === "tenants") return <TenantsPage run={run} setNotice={setNotice} />;
  if (area === "standards") return <StandardsPage run={run} setNotice={setNotice} />;
  if (area === "platform-audit" || area === "audit") return <AuditPage platform={isPlatform} />;
  if (area === "organization") return <OrganizationPage run={run} setNotice={setNotice} />;
  if (area === "members") return <MembersPage run={run} setNotice={setNotice} />;
  if (area === "reviews") return <ReviewsPage run={run} setNotice={setNotice} />;
  if (area === "shares") return <SharesPage run={run} setNotice={setNotice} />;
  if (area === "templates") return <TemplatesPage run={run} setNotice={setNotice} />;
  if (area === "orders") return <OrdersPage user={user} />;
  return <OrganizationOverview user={user} reload={reload} />;
}

function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="admin-page-title"><div><p className="admin-kicker">{eyebrow}</p><h1>{title}</h1><p>{detail}</p></div>{action}</div>;
}

function PlatformOverview({ navigate }: { navigate: (area: Area) => void }) {
  const [data, setData] = useState<{ tenants: { active: number; total: number }; orders: { currentMonth: number }; reports: { published: number }; media: { assets: number; bytes: string } } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api<typeof data>("/tenants/overview").then(setData).catch((reason) => setError(messageOf(reason))); }, []);
  return <>
    <PageTitle eyebrow="PLATFORM OVERVIEW" title="平台运营概览" detail="跨机构基础运行数据，不包含客户报告正文和检测照片。"
      action={<button className="admin-button admin-button--primary" onClick={() => navigate("tenants")} type="button">管理机构</button>} />
    {error && <div className="admin-alert admin-alert--error">{error}</div>}
    <div className="admin-stat-grid">
      <StatCard label="可用机构" value={data ? `${data.tenants.active} / ${data.tenants.total}` : "—"} hint="当前有效 / 累计" icon={<Building2 />} />
      <StatCard label="本月订单" value={data?.orders.currentMonth ?? "—"} hint="平台汇总" icon={<ClipboardList />} />
      <StatCard label="已发布报告" value={data?.reports.published ?? "—"} hint="不查看报告内容" icon={<FileCheck2 />} />
      <StatCard label="媒体文件" value={data?.media.assets ?? "—"} hint={data ? `${(Number(data.media.bytes) / 1024 / 1024).toFixed(1)} MB 存储` : "汇总统计"} icon={<Activity />} />
    </div>
    <div className="admin-panel admin-note-panel"><ShieldCheck size={22} /><div><strong>最小权限运营</strong><p>平台概览仅显示汇总指标。机构报告、检测照片和车辆明细仍由租户权限控制；平台敏感支持操作必须记录工单和原因。</p></div></div>
  </>;
}

function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: React.ReactNode }) {
  return <article className="admin-stat-card"><div className="admin-stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function OrganizationOverview({ user, reload }: { user: CurrentUser; reload: () => void }) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const isAdmin = user.memberships.some((membership) => membership.role === "ORG_ADMIN");
  useEffect(() => {
    if (isAdmin) {
      void Promise.all([
        api<OrganizationProfile>("/organization"),
        api<Member[]>("/organization/members"),
        api<ReviewItem[]>("/reviews"),
      ]).then(([nextProfile, nextMembers, nextReviews]) => {
        setProfile(nextProfile); setMembers(nextMembers); setReviews(nextReviews); setError("");
      }).catch((reason) => setError(messageOf(reason)));
    } else {
      void api<Array<Record<string, unknown>>>("/orders?limit=50")
        .then((result) => { setOrders(result); setError(""); })
        .catch((reason) => setError(messageOf(reason)));
    }
  }, [isAdmin]);
  return <>
    <PageTitle eyebrow="WORKSPACE OVERVIEW" title={profile?.displayName || user.memberships[0]?.tenant.name || "机构工作概览"} detail="查看当前机构的服务状态与近期工作。"
      action={<button className="admin-button admin-button--quiet" onClick={reload}><RefreshCw size={15} />刷新</button>} />
    {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
    <div className="admin-stat-grid admin-stat-grid--three">
      {isAdmin ? <>
        <StatCard label="机构状态" value={profile?.status ?? "—"} hint={`套餐 ${profile?.planCode ?? "—"}`} icon={<Building2 />} />
        <StatCard label="机构成员" value={members.length || "—"} hint="包含停用成员" icon={<Users />} />
        <StatCard label="待审核订单" value={reviews.length} hint="需要机构管理员处理" icon={<FileCheck2 />} />
      </> : <>
        <StatCard label="我的订单" value={orders.length} hint="仅统计当前列表返回的订单" icon={<ClipboardList />} />
        <StatCard label="所属机构" value={user.memberships[0]?.tenant.name || "—"} hint="当前工作空间" icon={<Building2 />} />
      </>}
    </div>
    <div className="admin-panel admin-note-panel"><ShieldCheck size={22} /><div><strong>检测师工作空间</strong><p>订单列表遵循当前账号权限。机构管理员可管理成员、更新机构资料并处理待审核报告。</p></div></div>
  </>;
}

function TenantsPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [inviteTenant, setInviteTenant] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdInvite, setCreatedInvite] = useState("");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => api<Tenant[]>("/tenants").then(setTenants), []);
  useEffect(() => { void load().then(() => setLoadError("")).catch((reason) => setLoadError(messageOf(reason))); }, [load]);

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api("/tenants", { method: "POST", body: JSON.stringify({ name, code }) });
      setName(""); setCode(""); setNotice("机构已创建。请先配置套餐并通过平台邀请创建机构管理员。");
      await load();
    });
  }
  async function updateSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      await api(`/tenants/${selected.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          planCode: String(form.get("planCode")),
          seatLimit: Number(form.get("seatLimit")),
          monthlyOrderLimit: String(form.get("monthlyOrderLimit")) ? Number(form.get("monthlyOrderLimit")) : null,
          expiresAt: String(form.get("expiresAt")) ? new Date(String(form.get("expiresAt"))).toISOString() : null,
          reason: String(form.get("reason")),
          ticketNumber: String(form.get("ticketNumber")),
        }),
      });
      formElement.reset(); setSelected(null); setNotice(`已更新「${selected.name}」的套餐与额度。`); await load();
    });
  }
  async function changeTenantStatus(tenant: Tenant, status: Tenant["status"]) {
    if (!reason.trim() || !ticketNumber.trim()) throw new Error("停用/恢复机构前请填写工单号和操作原因。");
    await api(`/tenants/${tenant.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason, ticketNumber }),
    });
    setNotice(`机构「${tenant.name}」已${status === "ACTIVE" ? "恢复" : "停用"}。`);
    setReason(""); setTicketNumber(""); await load();
  }
  async function createAdminInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteTenant) return;
    await run(async () => {
      const invitation = await api<{ invitationToken: string; expiresAt: string }>(`/tenants/${inviteTenant}/invitations`, {
        method: "POST",
        body: JSON.stringify({ role: "ORG_ADMIN", email: inviteEmail || undefined }),
      });
      setCreatedInvite(invitation.invitationToken);
      setInviteEmail("");
      setNotice(`机构管理员邀请已创建，有效期至 ${dateLabel(invitation.expiresAt)}。`);
      await load();
    });
  }

  return <>
    <PageTitle eyebrow="TENANT OPERATIONS" title="机构管理" detail="管理机构开通状态、服务期限、席位额度，并通过限时邀请开通首位机构管理员。" />
    <form className="admin-panel admin-inline-form" onSubmit={(event) => void createTenant(event)}>
      <div><h2>开通机构</h2><p>创建后默认启用；请随后设置套餐并创建管理员邀请。</p></div>
      <Field label="机构名称"><input maxLength={120} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} /></Field>
      <Field label="机构编码"><input maxLength={40} minLength={2} onChange={(event) => setCode(event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9-]{1,39}" required value={code} /></Field>
      <button className="admin-button admin-button--primary" type="submit">创建机构</button>
    </form>
    <div className="admin-panel admin-panel--spaced">
      <div className="admin-panel-heading"><div><h2>机构列表</h2><p>{tenants.length} 家机构</p></div></div>
      {loadError && <div className="admin-alert admin-alert--error" role="alert">{loadError}</div>}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>机构</th><th>状态</th><th>套餐 / 到期</th><th>席位</th><th>订单</th><th>操作</th></tr></thead><tbody>
        {tenants.map((tenant) => <tr key={tenant.id}>
          <td><strong>{tenant.name}</strong><small>{tenant.code}</small></td>
          <td><span className={`admin-status admin-status--${tenant.status.toLowerCase()}`}>{tenant.status}</span></td>
          <td>{tenant.planCode}<small>{dateLabel(tenant.expiresAt)}</small></td>
          <td>{tenant._count.memberships} / {tenant.seatLimit}</td>
          <td>{tenant._count.orders}</td>
          <td><div className="admin-row-actions">
            <button className="admin-text-button" onClick={() => { setSelected(tenant); setInviteTenant(tenant.id); }} type="button">套餐设置</button>
            <button className="admin-text-button" onClick={() => { setInviteTenant(tenant.id); setSelected(null); }} type="button">邀请管理员</button>
            <button className="admin-text-button" onClick={() => void run(() => changeTenantStatus(tenant, tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"))} type="button">{tenant.status === "ACTIVE" ? "停用" : "恢复"}</button>
          </div></td>
        </tr>)}
      </tbody></table></div>
      {!tenants.length && <EmptyPanel text="还没有机构。创建机构后即可配置套餐并开通机构管理员。" />}
      {(selected || inviteTenant) && <div className="admin-form-drawer">
        <div className="admin-panel-heading"><div><h2>{selected ? `更新套餐 · ${selected.name}` : "机构管理员邀请"}</h2><p>{selected ? "套餐及额度变更需要有效工单号和操作原因。" : "管理员邀请仅展示一次，请安全发送给指定人员。"}</p></div><button className="admin-icon-button" onClick={() => { setSelected(null); setInviteTenant(""); setCreatedInvite(""); }} type="button">×</button></div>
        {selected ? <form className="admin-form-grid" onSubmit={(event) => void updateSubscription(event)}>
          <Field label="套餐代码"><input defaultValue={selected.planCode} name="planCode" required /></Field>
          <Field label="席位上限"><input defaultValue={selected.seatLimit} min={1} name="seatLimit" required type="number" /></Field>
          <Field label="月订单上限（空为不限）"><input defaultValue={selected.monthlyOrderLimit ?? ""} min={1} name="monthlyOrderLimit" type="number" /></Field>
          <Field label="服务到期日（空为不限期）"><input defaultValue={selected.expiresAt ? new Date(selected.expiresAt).toISOString().slice(0, 10) : ""} name="expiresAt" type="date" /></Field>
          <Field label="工单号"><input maxLength={80} minLength={3} name="ticketNumber" pattern="[A-Za-z0-9._/-]{3,80}" required /></Field>
          <Field label="操作原因"><input maxLength={1000} minLength={10} name="reason" required /></Field>
          <button className="admin-button admin-button--primary" type="submit">保存套餐变更</button>
        </form> : <form className="admin-form-grid" onSubmit={(event) => void createAdminInvitation(event)}>
          <Field label="管理员邮箱（可选）"><input autoComplete="email" onChange={(event) => setInviteEmail(event.target.value)} type="email" value={inviteEmail} /></Field>
          <button className="admin-button admin-button--primary" type="submit">创建限时邀请</button>
          {createdInvite && <div className="admin-token"><strong>邀请令牌（仅此处显示）</strong><code>{createdInvite}</code><small>请通过安全渠道交付。接受邀请需要已配置的微信小程序登录。</small></div>}
        </form>}
      </div>}
    </div>
    <div className="admin-panel admin-support-reason"><h2>停用 / 恢复操作的工单依据</h2><div className="admin-form-grid">
      <Field label="工单号"><input maxLength={80} minLength={3} onChange={(event) => setTicketNumber(event.target.value)} pattern="[A-Za-z0-9._/-]{3,80}" value={ticketNumber} /></Field>
      <Field label="原因（至少 10 字）"><input maxLength={1000} minLength={10} onChange={(event) => setReason(event.target.value)} value={reason} /></Field>
    </div></div>
  </>;
}

function OrganizationPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api<OrganizationProfile>("/organization").then(setProfile).catch((reason) => setError(messageOf(reason))); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      const updated = await api<OrganizationProfile>("/organization", {
        method: "PATCH",
        body: JSON.stringify({
          name: String(data.get("name")),
          displayName: String(data.get("displayName")),
          reportDisclaimer: String(data.get("reportDisclaimer")),
        }),
      });
      setProfile({ ...profile!, ...updated }); setNotice("机构资料已保存。");
    });
  }
  return <>
    <PageTitle eyebrow="ORGANIZATION PROFILE" title="机构资料" detail="资料修改只影响后续报告快照；已签发报告内容保持不变。" />
    {error && <div className="admin-alert admin-alert--error">{error}</div>}
    {profile && <form className="admin-panel admin-form-grid" onSubmit={(event) => void save(event)}>
      <Field label="机构名称"><input defaultValue={profile.name} maxLength={120} minLength={2} name="name" required /></Field>
      <Field label="报告显示名称"><input defaultValue={profile.displayName} maxLength={120} minLength={2} name="displayName" required /></Field>
      <Field label="报告免责声明"><textarea defaultValue={profile.reportDisclaimer} maxLength={2000} name="reportDisclaimer" rows={5} /></Field>
      <div className="admin-readonly-info"><span>机构编码</span><strong>{profile.code}</strong><span>服务状态</span><strong>{profile.status} · {profile.planCode}</strong><span>服务到期</span><strong>{dateLabel(profile.expiresAt)}</strong></div>
      <button className="admin-button admin-button--primary" type="submit">保存资料</button>
    </form>}
  </>;
}

function MembersPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [nextMembers, nextInvitations] = await Promise.all([
      api<Member[]>("/organization/members"),
      api<Invitation[]>("/organization/invitations"),
    ]);
    setMembers(nextMembers); setInvitations(nextInvitations);
  }, []);
  useEffect(() => { void load().then(() => setError("")).catch((reason) => setError(messageOf(reason))); }, [load]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const result = await api<{ invitationToken: string; expiresAt: string }>("/organization/invitations", {
        method: "POST", body: JSON.stringify({ email: email || undefined }),
      });
      setToken(result.invitationToken); setEmail(""); setNotice(`检测师邀请已创建，有效期至 ${dateLabel(result.expiresAt)}。`); await load();
    });
  }
  async function status(member: Member) {
    const next = member.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await api(`/organization/members/${member.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    setNotice(`${member.user.displayName} 已${next === "ACTIVE" ? "重新启用" : "停用"}。`); await load();
  }
  async function revoke(invitation: Invitation) {
    await api(`/organization/invitations/${invitation.id}/revoke`, { method: "POST" });
    setNotice("邀请已撤销。"); await load();
  }
  return <>
    <PageTitle eyebrow="TEAM ACCESS" title="成员与邀请" detail="机构管理员可邀请检测师并停用机构成员；机构管理员角色只能由平台开通。" />
    {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
    <form className="admin-panel admin-inline-form" onSubmit={(event) => void invite(event)}>
      <div><h2>邀请检测师</h2><p>邀请令牌有效期为 72 小时。</p></div>
      <Field label="邮箱（可选）"><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></Field>
      <button className="admin-button admin-button--primary" type="submit">创建邀请</button>
      {token && <div className="admin-token"><strong>邀请令牌（仅此处显示）</strong><code>{token}</code><small>请通过安全渠道交付；接受邀请需使用机构绑定的微信小程序。</small></div>}
    </form>
    <section className="admin-panel admin-panel--spaced"><div className="admin-panel-heading"><div><h2>机构成员</h2><p>{members.length} 位成员</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>成员</th><th>角色</th><th>状态</th><th>加入时间</th><th>操作</th></tr></thead><tbody>
      {members.map((member) => <tr key={member.id}><td><strong>{member.user.displayName}</strong><small>{member.user.email || "未登记邮箱"}</small></td><td>{member.role === "ORG_ADMIN" ? "机构管理员" : "检测师"}</td><td>{member.status}</td><td>{dateLabel(member.createdAt)}</td><td><button className="admin-text-button" onClick={() => void run(() => status(member))} type="button">{member.status === "ACTIVE" ? "停用" : "重新启用"}</button></td></tr>)}
    </tbody></table></div>{!members.length && <EmptyPanel text="当前没有机构成员。" />}</section>
    <section className="admin-panel admin-panel--spaced"><div className="admin-panel-heading"><div><h2>待处理邀请</h2><p>过期、已接受或已撤销的邀请不可用于加入。</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>邮箱</th><th>角色</th><th>到期时间</th><th>状态</th><th></th></tr></thead><tbody>{invitations.map((invitation) => <tr key={invitation.id}><td>{invitation.email || "未指定"}</td><td>{invitation.role === "ORG_ADMIN" ? "机构管理员" : "检测师"}</td><td>{dateLabel(invitation.expiresAt)}</td><td>{invitation.acceptedAt ? "已接受" : invitation.revokedAt ? "已撤销" : new Date(invitation.expiresAt) < new Date() ? "已过期" : "待接受"}</td><td>{!invitation.acceptedAt && !invitation.revokedAt && <button className="admin-text-button admin-text-button--danger" onClick={() => void run(() => revoke(invitation))} type="button">撤销</button>}</td></tr>)}</tbody></table></div>{!invitations.length && <EmptyPanel text="暂无邀请记录。" />}</section>
  </>;
}

function ReviewsPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [comment, setComment] = useState("");
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => api<ReviewItem[]>("/reviews").then((result) => { setQueue(result); setLoadError(""); }), []);
  useEffect(() => { void load().catch((reason) => setLoadError(messageOf(reason))); }, [load]);
  async function decide(item: ReviewItem, action: "approve" | "return") {
    const revisionId = item.revision?.id;
    if (!revisionId) throw new Error("当前订单没有可审核的提交版本。");
    if (action === "return" && !comment.trim()) throw new Error("退回检测前必须填写明确的修改意见。");
    await api(`/reviews/${item.id}/${action}`, {
      method: "POST",
      body: JSON.stringify(action === "approve"
        ? { revisionId }
        : { revisionId, comment: comment.trim() }),
    });
    setSelected(null); setComment(""); setNotice(action === "approve" ? "审核通过，正式报告已生成。" : "检测已退回修改。"); await load();
  }
  async function show(item: ReviewItem) {
    await run(async () => setSelected(await api<Record<string, unknown>>(`/reviews/${item.id}`)));
  }
  return <>
    <PageTitle eyebrow="INSPECTION REVIEW" title="待审核队列" detail="仅机构管理员可审核本机构提交版本；通过后生成正式报告，退回必须附明确意见。" />
    {loadError && <div className="admin-alert admin-alert--error" role="alert">{loadError}</div>}
    <div className="admin-panel"><div className="admin-panel-heading"><div><h2>待审核检测</h2><p>{queue.length} 个待处理项目</p></div><button className="admin-button admin-button--quiet" onClick={() => void load()}><RefreshCw size={15} />刷新</button></div>
      <div className="admin-review-list">{queue.map((item) => <article className="admin-review-row" key={item.id}><div><strong>{item.orderNo}</strong><p>{[item.vehicle.brand, item.vehicle.model, item.vehicle.year].filter(Boolean).join(" ") || item.vehicle.kind} · {item.vehicle.plate || "未登记车牌"}</p><small>{item.template.title} · 检测师 {item.inspector.displayName} · {dateLabel(item.revision?.submittedAt)}</small></div><div className="admin-row-actions"><button className="admin-button admin-button--quiet" onClick={() => void show(item)} type="button">查看详情</button><button className="admin-button admin-button--primary" onClick={() => void run(() => decide(item, "approve"))} type="button">审核通过</button><button className="admin-button admin-button--warning" onClick={() => { setSelected({ order: item }); setComment(""); }} type="button">退回修改</button></div></article>)}</div>
      {!queue.length && <EmptyPanel text="当前没有待审核检测。" />}
    </div>
    {selected && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section aria-label="审核详情" aria-modal="true" className="admin-modal" role="dialog"><div className="admin-panel-heading"><div><p className="admin-kicker">REVIEW DETAILS</p><h2>审核检测版本</h2></div><button className="admin-icon-button" onClick={() => setSelected(null)} type="button">×</button></div>
      <div className="admin-json-view"><pre>{JSON.stringify(selected, null, 2)}</pre></div>
      <Field label="退回意见（退回时必填）"><textarea maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="请说明需要补充或修改的具体内容" rows={3} value={comment} /></Field>
      <div className="admin-row-actions"><button className="admin-button admin-button--primary" onClick={() => {
        const order = selected.order as ReviewItem | undefined;
        if (order) void run(() => decide(order, "approve"));
        else {
          const orderId = selected.id;
          const revision = selected.revision as { id?: string } | undefined;
          if (typeof orderId === "string" && revision?.id) void run(async () => {
            await api(`/reviews/${orderId}/approve`, { method: "POST", body: JSON.stringify({ revisionId: revision.id }) });
            setSelected(null); setNotice("审核通过，正式报告已生成。"); await load();
          });
        }
      }} type="button">审核通过</button><button className="admin-button admin-button--warning" onClick={() => {
        const order = selected.order as ReviewItem | undefined;
        if (order) void run(() => decide(order, "return"));
        else {
          const orderId = selected.id;
          const revision = selected.revision as { id?: string } | undefined;
          if (typeof orderId === "string" && revision?.id) void run(async () => {
            if (!comment.trim()) throw new Error("退回检测前必须填写明确的修改意见。");
            await api(`/reviews/${orderId}/return`, { method: "POST", body: JSON.stringify({ revisionId: revision.id, comment: comment.trim() }) });
            setSelected(null); setNotice("检测已退回修改。"); await load();
          });
        }
      }} type="button">退回修改</button></div>
    </section></div>}
  </>;
}

function OrdersPage({ user }: { user: CurrentUser }) {
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const isAdmin = user.memberships.some((membership) => membership.role === "ORG_ADMIN");
  useEffect(() => {
    void api<Array<Record<string, unknown>>>("/orders?limit=50").then(setOrders).catch((reason) => setError(messageOf(reason)));
  }, []);
  return <>
    <PageTitle eyebrow="INSPECTION ORDERS" title="检测订单" detail={isAdmin ? "本机构订单列表。平台后台不会跨机构读取车辆或检测详情。" : "仅显示当前检测师本人负责的订单。"} />
    {error && <div className="admin-alert admin-alert--error">{error}</div>}
    <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>订单编号</th><th>车辆</th><th>检测套餐</th><th>检测师</th><th>状态</th><th>创建时间</th></tr></thead><tbody>
      {orders.map((order) => {
        const vehicle = order.vehicle as Record<string, unknown> | undefined;
        const template = order.template as Record<string, unknown> | undefined;
        const inspector = order.inspector as Record<string, unknown> | undefined;
        return <tr key={String(order.id)}><td><strong>{String(order.orderNo || "—")}</strong></td><td>{[vehicle?.brand, vehicle?.model, vehicle?.year].filter(Boolean).join(" ") || String(vehicle?.kind || "—")}<small>{String(vehicle?.plate || "")}</small></td><td>{String(template?.title || "—")}</td><td>{String(inspector?.displayName || "—")}</td><td><span className="admin-status">{String(order.status || "—")}</span></td><td>{dateLabel(String(order.createdAt || ""))}</td></tr>;
      })}
    </tbody></table></div>{!orders.length && <EmptyPanel text="没有符合权限范围的订单。" />}</div>
  </>;
}

type ManagedTemplate = {
  id: string;
  code: string;
  title: string;
  vehicleKind: string;
  usage: string;
  standardType: string;
  standardRevision: {
    id: string;
    version: string;
    approvalRef: string | null;
    approvedAt: string | null;
    standard: { code: string; title: string };
  } | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    schema: { sections?: Array<{ items?: unknown[] }> };
    standardRevisionId: string | null;
    approvalRef: string | null;
    approvedAt: string | null;
    publishedAt: string | null;
  }>;
};

type ApprovedStandardRevision = {
  id: string;
  version: string;
  standard: { code: string; title: string };
};

function TemplatesPage({ run, setNotice }: {
  run: (action: () => Promise<void>) => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [templates, setTemplates] = useState<ManagedTemplate[]>([]);
  const [approvedStandards, setApprovedStandards] = useState<ApprovedStandardRevision[]>([]);
  const [selectedStandards, setSelectedStandards] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [managed, standards] = await Promise.all([
      api<ManagedTemplate[]>("/templates/management"),
      api<ApprovedStandardRevision[]>("/templates/approved-standard-revisions"),
    ]);
    setTemplates(managed);
    setApprovedStandards(standards);
    setError("");
  }, []);
  useEffect(() => { void load().catch((reason) => setError(messageOf(reason))); }, [load]);

  async function importConfigured() {
    await run(async () => {
      await api("/templates/import-configured", {
        method: "POST",
        body: JSON.stringify({ templates: buildConfiguredTemplateImport() }),
      });
      setNotice("八种原型检测清单已导入为未发布草稿；关联已审批标准并完成机构复核前，检测师不能用于建单。");
      await load();
    });
  }

  async function linkStandard(template: ManagedTemplate) {
    const revision = template.revisions[0];
    const standardRevisionId = selectedStandards[template.id] ?? revision?.standardRevisionId;
    if (!revision || !standardRevisionId) return;
    await run(async () => {
      await api(`/templates/${template.id}/revisions/${revision.id}/standard`, {
        method: "POST",
        body: JSON.stringify({ standardRevisionId }),
      });
      setNotice(`模板“${template.title}”已关联已审批标准版本。`);
      await load();
    });
  }

  async function publish(template: ManagedTemplate, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revision = template.revisions[0];
    if (!revision) return;
    const data = new FormData(event.currentTarget);
    await run(async () => {
      await api(`/templates/${template.id}/revisions/${revision.id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          approvalRef: String(data.get("approvalRef")),
          approvalNote: String(data.get("approvalNote")),
        }),
      });
      setNotice(`模板“${template.title}”已审核并发布。`);
      await load();
    });
  }

  return <>
    <PageTitle eyebrow="TEMPLATE LIBRARY" title="检测模板与草稿" detail="原型清单导入后保持未发布。必须关联平台已审批标准版本，并由机构记录复核依据后才能发布。"
      action={<button className="admin-button admin-button--primary" disabled={templates.some((template) => template.code.startsWith("car-"))} onClick={() => void importConfigured()} type="button">导入原型清单（8种）</button>} />
    {error && <div className="admin-alert admin-alert--error">{error}</div>}
    {!approvedStandards.length && <div className="admin-alert admin-alert--error" role="status">尚无平台已审批标准版本。清单可以导入为草稿，但不能关联、发布或供检测订单使用。</div>}
    <div className="admin-template-grid">{templates.map((template) => {
      const revision = template.revisions[0];
      const itemCount = revision?.schema.sections?.reduce((total, section) => total + (section.items?.length ?? 0), 0) ?? 0;
      const isPublished = Boolean(revision?.publishedAt);
      return <article className="admin-panel admin-template-card" key={template.id}>
        <div className="admin-template-mark"><FileText size={19} /></div>
        <h2>{template.title}</h2>
        <p>{template.code} · {template.vehicleKind} · {template.usage}</p>
        <div className="admin-template-meta"><span>{template.standardType}</span><span>{itemCount} 个检测项</span><span>修订版 {revision?.revisionNumber ?? "—"}</span></div>
        <small>{isPublished ? `已发布 · 审核引用：${revision?.approvalRef || "—"}` : "未发布草稿 · 不可用于生产建单"}</small>
        {!isPublished && revision && <>
          <Field label="已审批标准版本">
            <select
              onChange={(event) => setSelectedStandards((current) => ({ ...current, [template.id]: event.target.value }))}
              value={selectedStandards[template.id] ?? revision.standardRevisionId ?? ""}
            >
              <option value="">选择标准版本</option>
              {approvedStandards.map((standard) => <option key={standard.id} value={standard.id}>{standard.standard.code} · {standard.version} · {standard.standard.title}</option>)}
            </select>
          </Field>
          <button className="admin-button" disabled={!selectedStandards[template.id] && !revision.standardRevisionId} onClick={() => void linkStandard(template)} type="button">关联标准</button>
          {template.standardRevision && <p>标准：{template.standardRevision.standard.code} · {template.standardRevision.version}</p>}
          {revision.standardRevisionId && <form className="admin-form-grid admin-template-approval" onSubmit={(event) => void publish(template, event)}>
            <Field label="机构复核单号"><input maxLength={200} minLength={3} name="approvalRef" required /></Field>
            <Field label="复核说明"><textarea maxLength={2000} minLength={10} name="approvalNote" required rows={2} /></Field>
            <button className="admin-button admin-button--primary" type="submit">审核并发布</button>
          </form>}
        </>}
      </article>;
    })}</div>
    {!templates.length && <div className="admin-panel"><EmptyPanel text="当前机构没有已审核发布的模板。模板建立/编辑端尚未开放，不会使用演示项目冒充生产清单。" /></div>}
  </>;
}

function SharesPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [orders, setOrders] = useState<Array<{ id: string; orderNo: string; status: string }>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [reports, setReports] = useState<Array<{ id: string; reportNo: string; publishedAt: string }>>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [shares, setShares] = useState<Array<{ id: string; status: string; expiresAt: string; revokedAt: string | null; createdAt: string }>>([]);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [createdUrl, setCreatedUrl] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api<Array<Record<string, unknown>>>("/orders?limit=100").then((result) => {
      setOrders(result.filter((order) => order.status === "PUBLISHED").map((order) => ({
        id: String(order.id), orderNo: String(order.orderNo), status: String(order.status),
      })));
    }).catch((reason) => setError(messageOf(reason)));
  }, []);

  useEffect(() => {
    setReports([]);
    setSelectedReportId("");
    setShares([]);
    setCreatedUrl("");
    if (!selectedOrderId) return;
    let active = true;
    void api<Array<{ id: string; reportNo: string; publishedAt: string }>>(`/reports/orders/${selectedOrderId}`)
      .then((result) => { if (active) { setReports(result); setError(""); } })
      .catch((reason) => { if (active) setError(messageOf(reason)); });
    return () => { active = false; };
  }, [selectedOrderId]);

  useEffect(() => { setCreatedUrl(""); }, [selectedReportId]);

  useEffect(() => {
    if (!selectedReportId) return;
    let active = true;
    void api<typeof shares>(`/reports/${selectedReportId}/shares`)
      .then((result) => { if (active) { setShares(result); setError(""); } })
      .catch((reason) => { if (active) setError(messageOf(reason)); });
    return () => { active = false; };
  }, [selectedReportId, refreshKey]);

  async function createShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReportId) return;
    await run(async () => {
      const result = await api<{ url: string; expiresAt: string }> (
        `/reports/${selectedReportId}/shares`,
        { method: "POST", body: JSON.stringify({ expiresInDays }) },
      );
      setCreatedUrl(result.url);
      setNotice(`分享链接已创建，有效期至 ${dateLabel(result.expiresAt)}。`);
      setRefreshKey((value) => value + 1);
    });
  }

  async function revoke(shareId: string) {
    await run(async () => {
      await api(`/reports/${selectedReportId}/shares/${shareId}/revoke`, { method: "POST" });
      setNotice("分享链接已撤销，公开访问将被拒绝。");
      setRefreshKey((value) => value + 1);
    });
  }

  return <>
    <PageTitle eyebrow="REPORT SHARING" title="正式报告与分享链接" detail="只有已发布报告可生成分享；链接使用高熵令牌，可撤销，默认公开脱敏车辆信息及审核报告内容。" />
    {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
    <section className="admin-panel admin-share-picker">
      <Field label="已发布订单">
        <select onChange={(event) => setSelectedOrderId(event.target.value)} value={selectedOrderId}>
          <option value="">选择订单</option>
          {orders.map((order) => <option key={order.id} value={order.id}>{order.orderNo}</option>)}
        </select>
      </Field>
      <Field label="正式报告">
        <select disabled={!reports.length} onChange={(event) => setSelectedReportId(event.target.value)} value={selectedReportId}>
          <option value="">选择正式报告</option>
          {reports.map((report) => <option key={report.id} value={report.id}>{report.reportNo} · {dateLabel(report.publishedAt)}</option>)}
        </select>
      </Field>
      <button className="admin-button admin-button--quiet" disabled={!selectedOrderId} onClick={() => setRefreshKey((value) => value + 1)} type="button"><RefreshCw size={14} />刷新</button>
    </section>
    {selectedReportId && <>
      <form className="admin-panel admin-share-create" onSubmit={(event) => void createShare(event)}>
        <div><h2>创建公开分享</h2><p>创建后令牌仅返回一次；请通过安全渠道发送给委托人。</p></div>
        <Field label="有效期（1–90 天）"><input max={90} min={1} onChange={(event) => setExpiresInDays(Number(event.target.value))} required type="number" value={expiresInDays} /></Field>
        <button className="admin-button admin-button--primary" type="submit">生成分享链接</button>
        {createdUrl && <div className="admin-token"><strong>报告分享链接（持有者可访问）</strong><code>{createdUrl}</code><small>不要公开粘贴到不受控渠道。撤销链接后公开报告和照片预览均不可继续访问。</small></div>}
      </form>
      <section className="admin-panel admin-panel--spaced"><div className="admin-panel-heading"><div><h2>链接记录</h2><p>令牌明文不会保存在服务器或列表中。</p></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>创建时间</th><th>状态</th><th>有效期至</th><th>撤销时间</th><th></th></tr></thead><tbody>
          {shares.map((share) => <tr key={share.id}><td>{dateLabel(share.createdAt)}</td><td><span className={`admin-status ${share.status === "ACTIVE" ? "admin-status--active" : ""}`}>{share.status}</span></td><td>{dateLabel(share.expiresAt)}</td><td>{dateLabel(share.revokedAt)}</td><td>{share.status === "ACTIVE" && <button className="admin-text-button admin-text-button--danger" onClick={() => void revoke(share.id)} type="button">撤销</button>}</td></tr>)}
        </tbody></table></div>
        {!shares.length && <EmptyPanel text="该报告尚无分享记录。" />}
      </section>
    </>}
    {!selectedReportId && <div className="admin-panel admin-share-empty"><EmptyPanel text={selectedOrderId && reports.length === 0 ? "所选订单没有可分享的已发布报告。" : "选择一个已发布订单及正式报告，以管理公开分享链接。"} /></div>}
  </>;
}

function StandardsPage({ run, setNotice }: { run: (action: () => Promise<void>) => Promise<void>; setNotice: (value: string) => void }) {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [selected, setSelected] = useState("");
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => api<Standard[]>("/standards").then((result) => { setStandards(result); setLoadError(""); }), []);
  useEffect(() => { void load().catch((reason) => setLoadError(messageOf(reason))); }, [load]);
  async function createStandard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      await api("/standards", { method: "POST", body: JSON.stringify({
        code: String(data.get("code")), title: String(data.get("title")), owner: String(data.get("owner")) || undefined, licenseRef: String(data.get("licenseRef")),
      }) });
      setNotice("标准来源与使用授权记录已创建。"); form.reset(); await load();
    });
  }
  async function createRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      await api(`/standards/${selected}/revisions`, { method: "POST", body: JSON.stringify({
        version: String(data.get("version")), sourceFileName: String(data.get("sourceFileName")), sourceHash: String(data.get("sourceHash")),
        effectiveAt: String(data.get("effectiveAt")) ? new Date(String(data.get("effectiveAt"))).toISOString() : undefined,
        scope: String(data.get("scope")),
      }) });
      setNotice("标准版本元数据已记录。源文件尚未上传到本系统。"); form.reset(); await load();
    });
  }
  async function approve(standardId: string, revisionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      await api(`/standards/${standardId}/revisions/${revisionId}/approve`, { method: "POST", body: JSON.stringify({
        approvalRef: String(data.get("approvalRef")), approvalNote: String(data.get("approvalNote")),
      }) });
      setNotice("标准版本已审批。该审批仅代表记录工作流，不替代法律授权与专业审查。"); await load();
    });
  }
  return <>
    <PageTitle eyebrow="STANDARD GOVERNANCE" title="标准来源与审批" detail="仅超级管理员可使用。系统保存标准来源、文件摘要与审批元数据；当前不存储 PDF 附件。" />
    {loadError && <div className="admin-alert admin-alert--error" role="alert">{loadError}</div>}
    <div className="admin-standard-columns">
      <form className="admin-panel admin-form-grid" onSubmit={(event) => void createStandard(event)}>
        <h2>登记标准与授权</h2><p className="admin-form-help">先确认发布来源和许可，再录入版本文件摘要。禁止将未审核清单标为生产标准。</p>
        <Field label="标准代码"><input name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,39}" required /></Field>
        <Field label="标准名称"><input maxLength={200} name="title" required /></Field>
        <Field label="发布组织（可选）"><input maxLength={200} name="owner" /></Field>
        <Field label="授权/许可记录"><input maxLength={300} name="licenseRef" required /></Field>
        <button className="admin-button admin-button--primary" type="submit">登记标准</button>
      </form>
      <form className="admin-panel admin-form-grid" onSubmit={(event) => void createRevision(event)}>
        <h2>登记标准版本</h2><p className="admin-form-help">请先在受控位置核验原始附件。文件名和 SHA-256 仅记录元数据，不能代替附件存储。</p>
        <Field label="标准"><select onChange={(event) => setSelected(event.target.value)} required value={selected}><option value="">选择标准</option>{standards.map((standard) => <option key={standard.id} value={standard.id}>{standard.code} · {standard.title}</option>)}</select></Field>
        <Field label="版本"><input maxLength={80} name="version" required /></Field>
        <Field label="源文件名"><input maxLength={255} name="sourceFileName" required /></Field>
        <Field label="源文件 SHA-256"><input maxLength={64} minLength={64} name="sourceHash" pattern="[a-fA-F0-9]{64}" required /></Field>
        <Field label="生效日期"><input name="effectiveAt" type="date" /></Field>
        <Field label="适用范围"><textarea maxLength={2000} name="scope" required rows={2} /></Field>
        <button className="admin-button admin-button--primary" disabled={!selected} type="submit">登记待审批版本</button>
      </form>
    </div>
    <section className="admin-standard-list">{standards.map((standard) => <article className="admin-panel" key={standard.id}><div className="admin-panel-heading"><div><p className="admin-kicker">{standard.code}</p><h2>{standard.title}</h2><p>{standard.owner || "未登记发布组织"} · 授权：{standard.licenseRef}</p></div></div>
      {standard.revisions.map((revision) => <div className="admin-revision" key={revision.id}><div><strong>版本 {revision.version}</strong><span className={`admin-status ${revision.approvedAt ? "admin-status--active" : ""}`}>{revision.approvedAt ? "已审批" : "待审批"}</span><p>{revision.sourceFileName || "未登记源文件"} · SHA-256 {revision.sourceHash || "—"}</p><small>{revision.scope}</small></div>
        {!revision.approvedAt && <form className="admin-approval-form" onSubmit={(event) => void approve(standard.id, revision.id, event)}><Field label="专业复核单号"><input maxLength={200} minLength={3} name="approvalRef" required /></Field><Field label="复核记录"><input maxLength={2000} minLength={10} name="approvalNote" required /></Field><button className="admin-button admin-button--primary" type="submit">审批通过</button></form>}
      </div>)}
      {!standard.revisions.length && <EmptyPanel text="尚未登记版本。" />}
    </article>)}</section>
    {!standards.length && <div className="admin-panel"><EmptyPanel text="尚未登记标准。正式附件和授权尚未录入，不会自动生成生产模板。" /></div>}
  </>;
}

function AuditPage({ platform }: { platform: boolean }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<AuditEvent[]>(platform ? "/tenants/audit" : "/organization/audit").then(setEvents).catch((reason) => setError(messageOf(reason)));
  }, [platform]);
  return <>
    <PageTitle eyebrow={platform ? "PLATFORM AUDIT" : "ORGANIZATION AUDIT"} title={platform ? "平台操作审计" : "机构操作审计"} detail="审计数据仅展示允许查询的操作元数据，不包含密码、令牌、车辆敏感字段或媒体内容。" />
    {error && <div className="admin-alert admin-alert--error">{error}</div>}
    <div className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th>{platform && <th>租户</th>}<th>操作</th><th>资源</th><th>操作人</th><th>请求 ID</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{dateLabel(event.createdAt)}</td>{platform && <td>{event.tenantId || "平台"}</td>}<td><strong>{event.action}</strong><small>{JSON.stringify(event.metadata || {})}</small></td><td>{event.resourceType}<small>{event.resourceId || "—"}</small></td><td>{event.actorId || "—"}</td><td>{event.requestId || "—"}</td></tr>)}</tbody></table></div>{!events.length && !error && <EmptyPanel text="暂无审计事件。" />}</div>
  </>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="admin-empty"><Check size={20} /><p>{text}</p></div>;
}
