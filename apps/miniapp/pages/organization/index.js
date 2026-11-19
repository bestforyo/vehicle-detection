const api = require("../../utils/api");

const STATUS_LABELS = {
  ACTIVE: "已启用",
  DISABLED: "已停用",
};

const ROLE_LABELS = {
  ORG_ADMIN: "机构管理员",
  INSPECTOR: "检测师",
};

const ACTION_LABELS = {
  "organization.profile.update": "更新机构资料",
  "organization.member.active": "重新启用成员",
  "organization.member.disabled": "停用成员",
  "organization.invitation.revoke": "撤销成员邀请",
  "tenant.invitation.create": "创建成员邀请",
  "tenant.invitation.accept": "接受成员邀请",
  "template.prototype_import": "导入模板草稿",
  "template.standard_revision.link": "关联已审批标准",
  "template.revision.publish": "发布检测模板",
  "inspection.return": "退回检测记录",
  "report.publish": "审核并发布检测报告",
};

const FIELD_LABELS = {
  name: "机构名称",
  displayName: "报告展示名称",
  reportDisclaimer: "报告免责声明",
};

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${dateLabel(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function mapAuditEvent(event) {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const updatedFields = Array.isArray(metadata.updatedFields)
    ? metadata.updatedFields.map((field) => FIELD_LABELS[field]).filter(Boolean)
    : [];
  return {
    ...event,
    actionLabel: ACTION_LABELS[event.action] || "业务操作记录",
    createdLabel: dateTimeLabel(event.createdAt),
    actorLabel: event.actorId ? `操作人 ${event.actorId.slice(0, 8)}` : "系统操作",
    detailLabel: updatedFields.length ? `更新内容：${updatedFields.join("、")}` : "",
  };
}

Page({
  data: {
    profile: {},
    members: [],
    invitations: [],
    auditEvents: [],
    name: "",
    displayName: "",
    reportDisclaimer: "",
    invitationEmail: "",
    latestInvitationToken: "",
    loading: true,
    saving: false,
    auditLoading: false,
    auditLoadingMore: false,
    auditHasMore: false,
    auditError: "",
    error: "",
    unauthorized: false,
  },

  onShow() {
    if (getApp().globalData.workspaceRole !== "ORG_ADMIN") {
      this.setData({ unauthorized: true, loading: false });
      return;
    }
    this.loadOrganization();
  },

  onHide() {
    this.setData({ latestInvitationToken: "" });
  },

  onPullDownRefresh() {
    this.loadOrganization().finally(() => wx.stopPullDownRefresh());
  },

  async loadOrganization() {
    this.setData({ loading: true, error: "" });
    try {
      const [profile, members, invitations] = await Promise.all([
        api.api("/organization"),
        api.api("/organization/members"),
        api.api("/organization/invitations"),
      ]);
      const currentUserId = getApp().globalData.user && getApp().globalData.user.id;
      this.setData({
        profile,
        members: members.map((membership) => ({
          ...membership,
          roleLabel: ROLE_LABELS[membership.role] || membership.role,
          statusLabel: STATUS_LABELS[membership.status] || membership.status,
          isCurrentUser: membership.user.id === currentUserId,
          actionLabel: membership.status === "ACTIVE" ? "停用成员" : "重新启用",
        })),
        invitations: invitations.map((invitation) => ({
          ...invitation,
          roleLabel: ROLE_LABELS[invitation.role] || invitation.role,
          expiresLabel: dateLabel(invitation.expiresAt),
        })),
        name: profile.name || "",
        displayName: profile.displayName || "",
        reportDisclaimer: profile.reportDisclaimer || "",
      });
      await this.loadAudit(false);
    } catch (error) {
      this.setData({ error: error.message || "机构资料加载失败。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadAudit(append) {
    const auditEvents = append ? this.data.auditEvents : [];
    if (append) this.setData({ auditLoadingMore: true, auditError: "" });
    else this.setData({ auditLoading: true, auditError: "" });
    try {
      const cursor = append && auditEvents.length
        ? auditEvents[auditEvents.length - 1].id
        : "";
      const query = cursor ? `?limit=25&cursor=${encodeURIComponent(cursor)}` : "?limit=25";
      const events = await api.api(`/organization/audit${query}`);
      this.setData({
        auditEvents: auditEvents.concat(events.map(mapAuditEvent)),
        auditHasMore: events.length === 25,
      });
    } catch (error) {
      this.setData({ auditError: error.message || "机构操作记录加载失败。" });
    } finally {
      this.setData({ auditLoading: false, auditLoadingMore: false });
    }
  },

  loadMoreAudit() {
    if (!this.data.auditLoadingMore && this.data.auditHasMore) {
      return this.loadAudit(true);
    }
  },

  retryAudit() {
    if (!this.data.auditLoading) return this.loadAudit(false);
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value });
  },

  onDisplayNameInput(event) {
    this.setData({ displayName: event.detail.value });
  },

  onDisclaimerInput(event) {
    this.setData({ reportDisclaimer: event.detail.value });
  },

  onInvitationEmailInput(event) {
    this.setData({ invitationEmail: event.detail.value });
  },

  async saveProfile() {
    if (this.data.saving) return;
    const { name, displayName, reportDisclaimer, profile } = this.data;
    if (name.trim().length < 2 || displayName.trim().length < 2) {
      this.setData({ error: "机构名称和报告展示名称至少需要 2 个字符。" });
      return;
    }
    const data = {
      ...(name.trim() !== profile.name ? { name: name.trim() } : {}),
      ...(displayName.trim() !== profile.displayName ? { displayName: displayName.trim() } : {}),
      ...(reportDisclaimer !== (profile.reportDisclaimer || "") ? { reportDisclaimer: reportDisclaimer.trim() } : {}),
    };
    if (!Object.keys(data).length) {
      wx.showToast({ title: "机构资料没有变化", icon: "none" });
      return;
    }
    this.setData({ saving: true, error: "" });
    try {
      const updated = await api.api("/organization", {
        method: "PATCH",
        data,
      });
      this.setData({
        profile: { ...profile, ...updated },
        name: updated.name,
        displayName: updated.displayName,
        reportDisclaimer: updated.reportDisclaimer || "",
      });
      wx.showToast({ title: "机构资料已保存", icon: "success" });
    } catch (error) {
      this.setData({ error: error.message || "机构资料保存失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  async createInvitation() {
    if (this.data.saving) return;
    const email = this.data.invitationEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setData({ error: "请填写有效邮箱，或留空以创建不绑定邮箱的邀请。" });
      return;
    }
    this.setData({ saving: true, error: "", latestInvitationToken: "" });
    try {
      const invitation = await api.api("/organization/invitations", {
        method: "POST",
        data: email ? { email } : {},
      });
      this.setData({
        invitationEmail: "",
        latestInvitationToken: invitation.invitationToken,
      });
      wx.showToast({ title: "邀请已创建", icon: "success" });
      await this.loadOrganization();
    } catch (error) {
      this.setData({ error: error.message || "邀请创建失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    const token = this.data.latestInvitationToken;
    if (!token) {
      return { title: "加入机构检测团队", path: "/pages/login/index" };
    }
    return {
      title: `${this.data.profile.displayName || this.data.profile.name || "机构"}邀请你加入检测团队`,
      path: `/pages/login/index?invitationToken=${encodeURIComponent(token)}`,
    };
  },

  async toggleMemberStatus(event) {
    if (this.data.saving) return;
    const membership = this.data.members[Number(event.currentTarget.dataset.index)];
    if (!membership || membership.isCurrentUser) return;
    const nextStatus = membership.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const action = nextStatus === "ACTIVE" ? "重新启用" : "停用";
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: `${action}成员？`,
      content: nextStatus === "DISABLED"
        ? "停用后，该成员的机构登录会话将被撤销。"
        : "重新启用需要占用一个机构成员席位。",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/organization/members/${encodeURIComponent(membership.id)}/status`, {
        method: "PATCH",
        data: { status: nextStatus },
      });
      await this.loadOrganization();
      wx.showToast({ title: `成员已${action}`, icon: "success" });
    } catch (error) {
      this.setData({ error: error.message || `${action}成员失败。` });
    } finally {
      this.setData({ saving: false });
    }
  },

  async revokeInvitation(event) {
    if (this.data.saving) return;
    const invitation = this.data.invitations[Number(event.currentTarget.dataset.index)];
    if (!invitation) return;
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: "撤销邀请？",
      content: "撤销后，此邀请链接将立即失效。",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/organization/invitations/${encodeURIComponent(invitation.id)}/revoke`, { method: "POST" });
      await this.loadOrganization();
      wx.showToast({ title: "邀请已撤销", icon: "success" });
    } catch (error) {
      this.setData({ error: error.message || "撤销邀请失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
