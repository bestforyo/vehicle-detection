import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  FileCheck2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, CurrentUser, endSession, restoreSession, signIn, SignInResult, Workspace } from "../admin/api";
import "./inspector.css";

type VehicleKind = "PASSENGER_CAR" | "MOTORCYCLE";
type TemplateItem = {
  key: string;
  title: string;
  guidance?: string;
  options?: string[];
  decisionType?: "关键决定项" | "非关键决定项";
  required: boolean;
  evidenceRequiredWhen: string[];
  noteRequiredWhen: string[];
  thresholdRequiredWhen: string[];
};
type TemplateSchema = {
  version: 1;
  sections: Array<{
    key: string;
    title: string;
    guidance?: string;
    items: TemplateItem[];
  }>;
};
type InspectionTemplate = {
  id: string;
  code: string;
  title: string;
  vehicleKind: VehicleKind;
  usage: string;
  standardType: string;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    schema: TemplateSchema;
  }>;
};
type Answer = {
  value: string;
  note: string;
  thresholdFinding: string;
  evidenceAssetIds: string[];
};
type OrderStatus = "INSPECTING" | "REVIEW_PENDING" | "NEEDS_MODIFICATION" | "COMPLETED" | string;
type OrderSummary = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  createdAt: string;
  inspector: { id: string; displayName: string };
  vehicle: {
    kind: VehicleKind;
    brand: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
    plate: string | null;
  };
  template: { title: string; standardType: string };
};
type InspectionOrder = OrderSummary & {
  vehicle: OrderSummary["vehicle"] & { vin: string | null; firstRegisteredAt: string | null };
  latestReview: {
    decision: string;
    comment: string | null;
    targetKeys: string[];
    createdAt: string;
  } | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    status: string;
    schema: TemplateSchema;
    updatedAt: string;
    answers: Array<{ itemKey: string; value: string; note?: string; thresholdFinding?: string }>;
    evidence: Array<{ itemKey: string; assetId: string; mimeType: string; scanStatus: string }>;
  }>;
};
type UploadIntent = {
  assetId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  maxBytes: number;
};
type Screen = "orders" | "templates" | "review";

const SELECTED_TENANT_KEY = "jianjian-inspector-tenant";
const EDITABLE_STATUSES = new Set<OrderStatus>(["INSPECTING", "NEEDS_MODIFICATION"]);
const STATUS_LABELS: Record<string, string> = {
  INSPECTING: "检测中",
  REVIEW_PENDING: "待审核",
  NEEDS_MODIFICATION: "待修改",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

function emptyAnswer(): Answer {
  return { value: "", note: "", thresholdFinding: "", evidenceAssetIds: [] };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

function countItems(schema: TemplateSchema): number {
  return schema.sections.reduce((total, section) => total + section.items.length, 0);
}

function AppMark() {
  return <span className="inspector-mark"><ShieldCheck size={19} /></span>;
}

export default function InspectorApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [screen, setScreen] = useState<Screen>("orders");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersHaveMore, setOrdersHaveMore] = useState(false);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [order, setOrder] = useState<InspectionOrder | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("PASSENGER_CAR");
  const [templateRevisionId, setTemplateRevisionId] = useState("");
  const [vehicleForm, setVehicleForm] = useState({
    brand: "",
    model: "",
    year: "",
    plate: "",
    vin: "",
    mileage: "",
  });
  const [sectionIndex, setSectionIndex] = useState(0);

  const activeWorkspace = user?.activeWorkspace
    ? user.memberships.find((membership) => membership.tenant.id === user.activeWorkspace?.tenantId)
    : null;
  const roleLabel = user?.activeWorkspace?.role === "ORG_ADMIN" ? "机构管理员" : "检测师";
  const currentRevision = order?.revisions[0];
  const schema = currentRevision?.schema;
  const isEditable = Boolean(order && EDITABLE_STATUSES.has(order.status) && currentRevision?.status === "DRAFT");
  const availableTemplates = templates.filter((template) => template.vehicleKind === vehicleKind && template.revisions[0]);
  const selectedTemplate = availableTemplates.find((template) => template.revisions[0].id === templateRevisionId);

  const loadWorkspace = useCallback(async () => {
    const [orderList, templateList] = await Promise.all([
      api<OrderSummary[]>("/orders?limit=100"),
      api<InspectionTemplate[]>("/templates"),
    ]);
    setOrders(orderList);
    setOrdersHaveMore(orderList.length === 100);
    setTemplates(templateList);
  }, []);

  const loadOrder = useCallback(async (orderId: string) => {
    setBusy(true);
    setError("");
    try {
      const loaded = await api<InspectionOrder>(`/orders/${orderId}`);
      setOrder(loaded);
      const revision = loaded.revisions[0];
      const restored: Record<string, Answer> = {};
      for (const section of revision?.schema.sections ?? []) {
        for (const item of section.items) restored[item.key] = emptyAnswer();
      }
      for (const answer of revision?.answers ?? []) {
        restored[answer.itemKey] = {
          ...(restored[answer.itemKey] ?? emptyAnswer()),
          value: answer.value,
          note: answer.note ?? "",
          thresholdFinding: answer.thresholdFinding ?? "",
        };
      }
      for (const evidence of revision?.evidence ?? []) {
        const answer = restored[evidence.itemKey] ?? emptyAnswer();
        answer.evidenceAssetIds.push(evidence.assetId);
      }
      setAnswers(restored);
      setSectionIndex(0);
      setScreen("orders");
      setPreviews({});
      const evidenceIds = (revision?.evidence ?? [])
        .filter((evidence) => evidence.scanStatus === "CLEAN")
        .map((evidence) => evidence.assetId);
      if (evidenceIds.length) {
        const resolved = await Promise.all(evidenceIds.map(async (assetId) => {
          try {
            const result = await api<{ url: string }>(`/media/${assetId}/preview-url`, { method: "POST" });
            return [assetId, result.url] as const;
          } catch {
            return null;
          }
        }));
        const successful = resolved.filter((entry): entry is readonly [string, string] => entry !== null);
        setPreviews(Object.fromEntries(successful));
        if (successful.length !== evidenceIds.length) {
          setNotice("部分现场照片暂时无法预览；检测记录仍保存在服务器。");
        }
      }
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setBusy(false);
    }
  }, []);

  const acceptTokens = useCallback(async (result: SignInResult, chosenTenantId?: string) => {
    if (!result.accessToken || !result.refreshToken) return null;
    if (chosenTenantId) sessionStorage.setItem(SELECTED_TENANT_KEY, chosenTenantId);
    const current = await api<CurrentUser>("/auth/me");
    if (!current.activeWorkspace) {
      throw new Error("此账号当前没有已选机构工作空间，请联系机构管理员。");
    }
    sessionStorage.setItem(SELECTED_TENANT_KEY, current.activeWorkspace.tenantId);
    setUser(current);
    return current;
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const restored = await restoreSession();
        if (!active || !restored) return;
        if (!restored.activeWorkspace) {
          setWorkspaces(restored.memberships.map((membership) => ({
            id: membership.tenant.id,
            name: membership.tenant.name,
            code: membership.tenant.code,
            role: membership.role,
          })));
          setError("当前登录会话没有选择机构工作空间。请重新登录并选择工作空间。");
          await endSession();
          return;
        }
        if (active) {
          setUser(restored);
          sessionStorage.setItem(SELECTED_TENANT_KEY, restored.activeWorkspace.tenantId);
          const [orderList, templateList] = await Promise.all([
            api<OrderSummary[]>("/orders?limit=100"),
            api<InspectionTemplate[]>("/templates"),
          ]);
          if (active) {
            setOrders(orderList);
            setTemplates(templateList);
          }
        }
      } catch (loadError) {
        if (active) setError(errorText(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (availableTemplates.length && !availableTemplates.some((template) => template.revisions[0].id === templateRevisionId)) {
      setTemplateRevisionId(availableTemplates[0].revisions[0].id);
    }
  }, [availableTemplates, templateRevisionId]);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn(email, password, tenantId || undefined);
      if (result.requiresWorkspaceSelection) {
        setWorkspaces(result.workspaces ?? []);
        setTenantId("");
        return;
      }
      const chosenTenantId = tenantId || result.workspaces?.[0]?.id;
      if (!chosenTenantId && result.accessToken) {
        await endSession();
        throw new Error("检测师工作台需要有效的机构工作空间，请确认账号已加入机构。");
      }
      const current = await acceptTokens(result, chosenTenantId);
      if (!current) throw new Error("登录未完成，请重试。");
      await loadWorkspace();
      setPassword("");
      setWorkspaces([]);
    } catch (signInError) {
      setError(errorText(signInError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshData() {
    setBusy(true);
    setError("");
    try {
      await loadWorkspace();
      setNotice("已从服务器刷新。");
    } catch (refreshError) {
      setError(errorText(refreshError));
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreOrders() {
    const cursor = orders[orders.length - 1]?.id;
    if (!cursor || !ordersHaveMore) return;
    setBusy(true);
    setError("");
    try {
      const nextPage = await api<OrderSummary[]>(`/orders?limit=100&cursor=${encodeURIComponent(cursor)}`);
      setOrders((current) => [...current, ...nextPage]);
      setOrdersHaveMore(nextPage.length === 100);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    if (!selectedTemplate) return;
    if (vehicleKind !== "PASSENGER_CAR") {
      setError("摩托车新建检测暂未开放，请勿通过管理接口绕过当前产品限制。");
      return;
    }
    if (!vehicleForm.brand.trim() || !vehicleForm.model.trim()) {
      setError("请填写车辆品牌和车型。");
      return;
    }
    if (!vehicleForm.plate.trim() && !vehicleForm.vin.trim()) {
      setError("车牌号和车架号至少填写一项。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<InspectionOrder>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          templateRevisionId: selectedTemplate.revisions[0].id,
          vehicleKind,
          brand: vehicleForm.brand.trim(),
          model: vehicleForm.model.trim(),
          ...(vehicleForm.year ? { year: Number(vehicleForm.year) } : {}),
          ...(vehicleForm.plate.trim() ? { plate: vehicleForm.plate.trim() } : {}),
          ...(vehicleForm.vin.trim() ? { vin: vehicleForm.vin.trim().toUpperCase() } : {}),
          ...(vehicleForm.mileage ? { mileage: Number(vehicleForm.mileage) } : {}),
        }),
      });
      setShowCreate(false);
      setVehicleForm({ brand: "", model: "", year: "", plate: "", vin: "", mileage: "" });
      await loadWorkspace();
      await loadOrder(created.id);
      setNotice("检测订单已在服务器创建。");
    } catch (createError) {
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  function updateAnswer(itemKey: string, patch: Partial<Answer>) {
    setAnswers((current) => ({
      ...current,
      [itemKey]: { ...(current[itemKey] ?? emptyAnswer()), ...patch },
    }));
  }

  async function uploadEvidence(item: TemplateItem, file?: File) {
    if (!file || !order || !currentRevision) return;
    const mimeType = file.type.toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      setError("照片仅支持 JPEG、PNG 或 WebP 格式。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const intent = await api<UploadIntent>("/media/upload-intents", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          revisionId: currentRevision.id,
          itemKey: item.key,
          fileName: file.name.slice(0, 160),
          mimeType,
          sizeBytes: file.size,
        }),
      });
      if (file.size > intent.maxBytes) {
        throw new Error(`照片超过当前配置的单文件限制（${Math.floor(intent.maxBytes / 1024 / 1024)} MB）。`);
      }
      const uploaded = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.uploadHeaders,
        body: file,
      });
      if (!uploaded.ok) throw new Error(`对象存储上传失败（${uploaded.status}），请检查存储服务或重试。`);
      await api(`/media/${intent.assetId}/complete`, {
        method: "POST",
        body: JSON.stringify({ assetId: intent.assetId }),
      });
      updateAnswer(item.key, {
        evidenceAssetIds: [...(answers[item.key]?.evidenceAssetIds ?? []), intent.assetId],
      });
      try {
        const preview = await api<{ url: string }>(`/media/${intent.assetId}/preview-url`, { method: "POST" });
        setPreviews((current) => ({ ...current, [intent.assetId]: preview.url }));
      } catch {
        setNotice("照片已安全处理；预览链接暂不可用，可继续保存检测草稿。");
      }
      setNotice("现场照片已上传并通过服务端处理。保存草稿后会关联到检测记录。");
    } catch (uploadError) {
      setError(errorText(uploadError));
    } finally {
      setBusy(false);
    }
  }

  function validateAnswers(): string | null {
    if (!schema) return "检测模板结构不可用，请联系机构管理员。";
    for (const section of schema.sections) {
      for (const item of section.items) {
        const answer = answers[item.key] ?? emptyAnswer();
        if (item.required && !answer.value.trim()) return `请完成“${item.title}”。`;
        if (item.noteRequiredWhen.includes(answer.value) && !answer.note.trim()) {
          return `请为“${item.title}”补充说明。`;
        }
        if (item.thresholdRequiredWhen.includes(answer.value) && !answer.thresholdFinding) {
          return `请为“${item.title}”完成尺寸判定。`;
        }
        if (item.evidenceRequiredWhen.includes(answer.value) && !answer.evidenceAssetIds.length) {
          return `请为“${item.title}”添加现场照片。`;
        }
      }
    }
    return null;
  }

  async function saveDraft(submit = false) {
    if (!order || !currentRevision || !schema || !isEditable) return;
    if (submit) {
      const validationError = validateAnswers();
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const answerList = schema.sections.flatMap((section) => section.items.map((item) => {
        const answer = answers[item.key] ?? emptyAnswer();
        return {
          itemKey: item.key,
          value: answer.value,
          ...(answer.note.trim() ? { note: answer.note.trim() } : {}),
          ...(answer.thresholdFinding ? { thresholdFinding: answer.thresholdFinding } : {}),
          evidenceAssetIds: answer.evidenceAssetIds,
        };
      }));
      const saved = await api<{ revisionId: string; updatedAt: string }>(`/orders/${order.id}/inspection/draft`, {
        method: "PUT",
        body: JSON.stringify({
          revisionId: currentRevision.id,
          revisionUpdatedAt: currentRevision.updatedAt,
          answers: answerList,
        }),
      });
      setOrder((current) => current ? {
        ...current,
        revisions: current.revisions.map((revision) => revision.id === saved.revisionId
          ? { ...revision, updatedAt: saved.updatedAt }
          : revision),
      } : current);
      if (submit) {
        await api(`/orders/${order.id}/inspection/submit`, {
          method: "POST",
          body: JSON.stringify({ revisionId: currentRevision.id }),
        });
        setNotice("检测内容已提交审核并锁定。");
        setOrder((current) => current ? { ...current, status: "REVIEW_PENDING" } : current);
        await loadWorkspace();
      } else {
        setNotice("检测草稿已保存到服务器。");
      }
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await endSession();
    } catch (logoutError) {
      setError(errorText(logoutError));
    } finally {
      sessionStorage.removeItem(SELECTED_TENANT_KEY);
      setUser(null);
      setOrders([]);
      setOrdersHaveMore(false);
      setTemplates([]);
      setOrder(null);
      setWorkspaces([]);
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="inspector-loading"><AppMark /><p>正在安全恢复工作空间…</p></main>;
  }

  if (!user) {
    return (
      <main className="inspector-login">
        <section className="inspector-login__card">
          <AppMark />
          <p className="inspector-eyebrow">INSPECTION WORKSPACE</p>
          <h1>鉴见检测工作台</h1>
          <p className="inspector-muted">使用机构账号登录。检测记录将保存至机构业务系统。</p>
          {error && <div className="inspector-alert inspector-alert--error" role="alert">{error}</div>}
          <form onSubmit={handleSignIn} className="inspector-form">
            <label>邮箱<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>密码<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {workspaces.length > 0 && (
              <label>机构工作空间
                <select required value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
                  <option value="">选择要进入的机构</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}（{workspace.role === "ORG_ADMIN" ? "管理员" : "检测师"}）</option>)}
                </select>
              </label>
            )}
            <button className="inspector-button inspector-button--primary" disabled={busy}>
              {busy ? "正在验证…" : workspaces.length ? "进入所选机构" : "安全登录"}
            </button>
          </form>
          <p className="inspector-footnote">现场微信登录需通过已配置的小程序客户端。平台管理员请使用管理工作台。</p>
        </section>
      </main>
    );
  }

  return (
    <div className="inspector-shell">
      <header className="inspector-header">
        <a className="inspector-brand" href="/" aria-label="鉴见工作台"><AppMark /><span><strong>鉴见</strong><small>检测工作台</small></span></a>
        <div className="inspector-workspace">
          <span>{activeWorkspace?.tenant.name ?? "机构工作空间"}</span>
          <small>{roleLabel} · {user.displayName}</small>
        </div>
        <button className="inspector-icon-button" onClick={() => void refreshData()} disabled={busy} aria-label="刷新数据"><RefreshCw size={17} /></button>
        <button className="inspector-icon-button" onClick={() => void logout()} disabled={busy} aria-label="退出登录"><LogOut size={17} /></button>
      </header>

      <nav className="inspector-tabs" aria-label="工作台导航">
        <button className={screen === "orders" ? "is-active" : ""} onClick={() => { setOrder(null); setScreen("orders"); }}><ClipboardCheck size={16} />检测订单</button>
        <button className={screen === "templates" ? "is-active" : ""} onClick={() => { setOrder(null); setScreen("templates"); }}><FileCheck2 size={16} />已发布模板</button>
      </nav>

      <main className="inspector-main">
        {error && <div className="inspector-alert inspector-alert--error" role="alert">{error}<button onClick={() => setError("")} aria-label="关闭错误">×</button></div>}
        {notice && <div className="inspector-alert inspector-alert--success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
        {order ? (
          <InspectionEditor
            order={order}
            schema={schema}
            answers={answers}
            previews={previews}
            sectionIndex={sectionIndex}
            setSectionIndex={setSectionIndex}
            isEditable={isEditable}
            busy={busy}
            saving={saving}
            onBack={() => { setOrder(null); }}
            onChange={updateAnswer}
            onUpload={uploadEvidence}
            onSave={saveDraft}
          />
        ) : screen === "templates" ? (
          <TemplatesView templates={templates} onUse={(template) => {
            setVehicleKind(template.vehicleKind);
            setTemplateRevisionId(template.revisions[0].id);
            setScreen("orders");
            setShowCreate(true);
          }} />
        ) : (
          <OrdersView
            orders={orders}
            role={roleLabel}
            loading={busy}
            hasMore={ordersHaveMore}
            onCreate={() => {
              setVehicleKind("PASSENGER_CAR");
              setShowCreate(true);
            }}
            onOpen={(id) => void loadOrder(id)}
            onLoadMore={() => void loadMoreOrders()}
          />
        )}
      </main>

      {showCreate && (
        <CreateOrderDialog
          vehicleKind={vehicleKind}
          setVehicleKind={setVehicleKind}
          templates={availableTemplates}
          selectedTemplateId={templateRevisionId}
          setSelectedTemplateId={setTemplateRevisionId}
          form={vehicleForm}
          setForm={setVehicleForm}
          busy={busy}
          onClose={() => setShowCreate(false)}
          onSubmit={createOrder}
        />
      )}
    </div>
  );
}

function OrdersView({ orders, role, loading, hasMore, onCreate, onOpen, onLoadMore }: {
  orders: OrderSummary[];
  role: string;
  loading: boolean;
  hasMore: boolean;
  onCreate: () => void;
  onOpen: (orderId: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <section>
      <div className="inspector-page-heading">
        <div><p className="inspector-eyebrow">WORKSPACE · ORDERS</p><h1>检测订单</h1><p>仅显示当前机构及当前账号有权访问的服务端记录。</p></div>
        <button className="inspector-button inspector-button--primary" onClick={onCreate}><Plus size={17} />创建检测订单</button>
      </div>
      {orders.length ? <div className="inspector-order-list">
        {orders.map((order) => <button className="inspector-order-card" key={order.id} onClick={() => onOpen(order.id)}>
          <span className={`inspector-status inspector-status--${order.status.toLowerCase()}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
          <strong>{order.vehicle.brand ?? "车辆"} {order.vehicle.model ?? ""}</strong>
          <span>{order.template.title} · {order.template.standardType}</span>
          <small>{order.orderNo}　{order.vehicle.plate ?? "未填写车牌"}　{order.inspector.displayName}</small>
        </button>)}
        {hasMore && <button className="inspector-button inspector-button--secondary inspector-load-more" onClick={onLoadMore} disabled={loading}>{loading ? "正在加载…" : "加载更早的订单"}</button>}
      </div> : <div className="inspector-empty">
        <ClipboardCheck size={28} />
        <h2>{loading ? "正在加载订单…" : "暂无检测订单"}</h2>
        <p>{role === "检测师" ? "新订单将归属当前检测师，并通过服务端保存。" : "机构订单将在这里显示；检测师账号只会看到分配给自己的订单。"}</p>
        <button className="inspector-button inspector-button--secondary" onClick={onCreate}>创建检测订单</button>
      </div>}
    </section>
  );
}

function TemplatesView({ templates, onUse }: {
  templates: InspectionTemplate[];
  onUse: (template: InspectionTemplate) => void;
}) {
  const available = templates.filter((template) => template.revisions[0]);
  return (
    <section>
      <div className="inspector-page-heading"><div><p className="inspector-eyebrow">APPROVED · PUBLISHED</p><h1>已发布检测模板</h1><p>只使用机构内已审核并发布的模板版本。</p></div></div>
      {available.length ? <div className="inspector-template-grid">{available.map((template) => <article className="inspector-template-card" key={template.id}>
        <span className="inspector-template-card__standard">{template.standardType} · 修订版 {template.revisions[0].revisionNumber}</span>
        <h2>{template.title}</h2>
        <p>{template.usage || "未分类检测"} · {template.vehicleKind === "PASSENGER_CAR" ? "乘用车" : "摩托车"}</p>
        <small>{countItems(template.revisions[0].schema)} 个检测项</small>
        <button className="inspector-button inspector-button--secondary" onClick={() => onUse(template)}>使用此模板</button>
      </article>)}</div> : <div className="inspector-empty">
        <FileCheck2 size={28} /><h2>机构暂未发布可用模板</h2>
        <p>为避免把示例清单当作正式标准，当前只显示平台审批并由机构发布的模板。请管理员完成标准和模板审核后再创建正式检测。</p>
        <a className="inspector-link-button" href="/admin">前往管理工作台</a>
      </div>}
    </section>
  );
}

function CreateOrderDialog({ vehicleKind, setVehicleKind, templates, selectedTemplateId, setSelectedTemplateId, form, setForm, busy, onClose, onSubmit }: {
  vehicleKind: VehicleKind;
  setVehicleKind: (value: VehicleKind) => void;
  templates: InspectionTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  form: { brand: string; model: string; year: string; plate: string; vin: string; mileage: string };
  setForm: (value: { brand: string; model: string; year: string; plate: string; vin: string; mileage: string }) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return <div className="inspector-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="inspector-dialog" role="dialog" aria-modal="true" aria-labelledby="create-order-title">
      <div className="inspector-dialog__heading"><div><p className="inspector-eyebrow">NEW INSPECTION</p><h2 id="create-order-title">创建检测订单</h2></div><button className="inspector-icon-button" onClick={onClose} aria-label="关闭">×</button></div>
      <form className="inspector-form" onSubmit={onSubmit}>
        <label>车辆类型
          <select value={vehicleKind} onChange={(event) => setVehicleKind(event.target.value as VehicleKind)}>
            <option value="PASSENGER_CAR">乘用车</option>
            <option value="MOTORCYCLE" disabled>摩托车（正在建设中）</option>
          </select>
        </label>
        <label>已发布检测模板
          <select required value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={!templates.length}>
            {!templates.length && <option value="">当前车辆类型没有可用模板</option>}
            {templates.map((template) => <option key={template.revisions[0].id} value={template.revisions[0].id}>{template.title} · {template.standardType} · {template.usage}</option>)}
          </select>
        </label>
        <div className="inspector-form-grid">
          <label>品牌<input required maxLength={100} value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label>
          <label>车型<input required maxLength={120} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label>
          <label>年份<input type="number" min="1886" max="2200" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></label>
          <label>里程（公里）<input type="number" min="0" max="10000000" value={form.mileage} onChange={(event) => setForm({ ...form, mileage: event.target.value })} /></label>
          <label>车牌号<input maxLength={20} value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} /></label>
          <label>车架号（VIN）<input maxLength={17} minLength={17} value={form.vin} onChange={(event) => setForm({ ...form, vin: event.target.value.toUpperCase() })} /></label>
        </div>
        <p className="inspector-footnote">车牌号与车架号至少填写一项。敏感车辆标识由后端加密保存；检测草稿按模板修订版本记录。</p>
        <div className="inspector-dialog__actions"><button type="button" className="inspector-button inspector-button--secondary" onClick={onClose}>取消</button><button className="inspector-button inspector-button--primary" disabled={busy || !templates.length}>创建并开始检测</button></div>
      </form>
    </section>
  </div>;
}

function InspectionEditor({ order, schema, answers, previews, sectionIndex, setSectionIndex, isEditable, busy, saving, onBack, onChange, onUpload, onSave }: {
  order: InspectionOrder;
  schema?: TemplateSchema;
  answers: Record<string, Answer>;
  previews: Record<string, string>;
  sectionIndex: number;
  setSectionIndex: (index: number) => void;
  isEditable: boolean;
  busy: boolean;
  saving: boolean;
  onBack: () => void;
  onChange: (itemKey: string, patch: Partial<Answer>) => void;
  onUpload: (item: TemplateItem, file?: File) => void;
  onSave: (submit?: boolean) => void;
}) {
  const sections = schema?.sections ?? [];
  const activeSection = sections[sectionIndex] ?? sections[0];
  const incompleteCount = useMemo(() => sections.flatMap((section) => section.items).filter((item) => {
    const answer = answers[item.key] ?? emptyAnswer();
    return (item.required && !answer.value)
      || (item.noteRequiredWhen.includes(answer.value) && !answer.note.trim())
      || (item.thresholdRequiredWhen.includes(answer.value) && !answer.thresholdFinding)
      || (item.evidenceRequiredWhen.includes(answer.value) && !answer.evidenceAssetIds.length);
  }).length, [answers, sections]);
  return <section className="inspector-inspection">
    <div className="inspector-inspection__top"><button className="inspector-back" onClick={onBack}><ArrowLeft size={17} />返回订单</button><span className={`inspector-status inspector-status--${order.status.toLowerCase()}`}>{STATUS_LABELS[order.status] ?? order.status}</span></div>
    <div className="inspector-inspection__heading"><div><p className="inspector-eyebrow">{order.orderNo} · 修订版 {order.revisions[0]?.revisionNumber}</p><h1>{order.vehicle.brand} {order.vehicle.model}</h1><p>{order.template.title} · {order.template.standardType}　{order.vehicle.plate ?? ""}</p></div></div>
    {!isEditable && <div className="inspector-alert inspector-alert--info">此检测版本已提交或不可编辑。审核与退回操作由机构管理员在管理工作台完成。</div>}
    {order.latestReview?.decision === "RETURNED" && order.latestReview.comment && <div className="inspector-review-note"><strong>审核退回意见</strong><p>{order.latestReview.comment}</p></div>}
    <div className="inspector-inspection__layout">
      <nav className="inspector-section-nav" aria-label="检测模块">
        {sections.map((section, index) => {
          const completed = section.items.filter((item) => {
            const answer = answers[item.key] ?? emptyAnswer();
            return answer.value
              && (!item.noteRequiredWhen.includes(answer.value) || answer.note.trim())
              && (!item.thresholdRequiredWhen.includes(answer.value) || answer.thresholdFinding)
              && (!item.evidenceRequiredWhen.includes(answer.value) || answer.evidenceAssetIds.length > 0);
          }).length;
          return <button key={section.key} className={index === sectionIndex ? "is-active" : ""} onClick={() => setSectionIndex(index)}><span>{section.title}</span><small>{completed}/{section.items.length}</small></button>;
        })}
      </nav>
      <div className="inspector-section-content">
        {activeSection && <div className="inspector-section-heading"><div><h2>{activeSection.title}</h2>{activeSection.guidance && <p>{activeSection.guidance}</p>}</div><span>{activeSection.items.length} 项</span></div>}
        {activeSection?.items.map((item) => {
          const answer = answers[item.key] ?? emptyAnswer();
          const needsNote = item.noteRequiredWhen.includes(answer.value);
          const needsThreshold = item.thresholdRequiredWhen.includes(answer.value);
          const needsEvidence = item.evidenceRequiredWhen.includes(answer.value);
          return <article className="inspector-item" key={item.key}>
            <div className="inspector-item__heading"><div><strong>{item.title}</strong>{item.required && <i>必检</i>}</div>{item.guidance && <p>{item.guidance}</p>}</div>
            {item.options?.length ? <div className="inspector-options" role="group" aria-label={`${item.title}检测结果`}>
              {item.options.map((option) => <button key={option} type="button" disabled={!isEditable} className={answer.value === option ? "is-selected" : ""} onClick={() => onChange(item.key, { value: option, thresholdFinding: needsThreshold && option === answer.value ? answer.thresholdFinding : "" })}>{option}</button>)}
            </div> : <label className="inspector-form__inline">检测结果<input disabled={!isEditable} maxLength={500} value={answer.value} onChange={(event) => onChange(item.key, { value: event.target.value })} /></label>}
            {needsNote && <label className="inspector-note-field">必填说明<textarea disabled={!isEditable} maxLength={2000} value={answer.note} onChange={(event) => onChange(item.key, { note: event.target.value })} placeholder="请记录现场依据，最多 2000 字" /></label>}
            {needsThreshold && <fieldset className="inspector-threshold"><legend>尺寸判定（必填）</legend>
              <label><input type="radio" disabled={!isEditable} checked={answer.thresholdFinding === "LESS_THAN_30CM_X_30CM"} onChange={() => onChange(item.key, { thresholdFinding: "LESS_THAN_30CM_X_30CM" })} />小于 30cm × 30cm</label>
              <label><input type="radio" disabled={!isEditable} checked={answer.thresholdFinding === "GREATER_THAN_30CM_X_30CM"} onChange={() => onChange(item.key, { thresholdFinding: "GREATER_THAN_30CM_X_30CM" })} />大于 30cm × 30cm</label>
            </fieldset>}
            <div className="inspector-evidence">
              <div><Camera size={15} /><span>{needsEvidence ? "该结果需现场照片" : "现场照片"}</span><small>{answer.evidenceAssetIds.length} 张</small></div>
              {answer.evidenceAssetIds.length > 0 && <div className="inspector-evidence__previews">{answer.evidenceAssetIds.map((assetId) => <div key={assetId} className="inspector-evidence__thumb">
                {previews[assetId] ? <img src={previews[assetId]} alt={`${item.title}现场照片`} /> : <span>照片已保存</span>}
                {isEditable && <button type="button" onClick={() => onChange(item.key, { evidenceAssetIds: answer.evidenceAssetIds.filter((id) => id !== assetId) })} aria-label="移除此照片">×</button>}
              </div>)}</div>}
              {isEditable && <label className="inspector-upload-button"><Camera size={15} />上传照片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; void onUpload(item, file); event.currentTarget.value = ""; }} /></label>}
            </div>
          </article>;
        })}
        <div className="inspector-section-pagination">
          <button className="inspector-button inspector-button--secondary" disabled={sectionIndex <= 0} onClick={() => setSectionIndex(Math.max(0, sectionIndex - 1))}>上一模块</button>
          <span>模块 {sections.length ? sectionIndex + 1 : 0} / {sections.length}</span>
          <button className="inspector-button inspector-button--secondary" disabled={sectionIndex >= sections.length - 1} onClick={() => setSectionIndex(Math.min(sections.length - 1, sectionIndex + 1))}>下一模块</button>
        </div>
        {isEditable && <div className="inspector-savebar">
          <p>草稿将保存到当前机构，可稍后继续。{incompleteCount > 0 ? ` 尚有 ${incompleteCount} 项未完成。` : ""}</p>
          <button className="inspector-button inspector-button--secondary" disabled={saving} onClick={() => onSave(false)}>保存草稿</button>
          <button className="inspector-button inspector-button--primary" disabled={saving} onClick={() => onSave(true)}>{saving ? "正在保存…" : "提交审核"}</button>
        </div>}
      </div>
    </div>
  </section>;
}
