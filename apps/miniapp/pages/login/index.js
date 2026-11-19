const api = require("../../utils/api");

Page({
  data: {
    busy: false,
    error: "",
    invitationToken: "",
    displayName: "",
    workspaces: [],
    workspaceIndex: -1,
    selectedWorkspace: {},
  },

  onLoad(query) {
    this.setData({
      invitationToken: typeof query.invitationToken === "string" ? query.invitationToken : "",
    });
  },

  async onShow() {
    if (this.data.invitationToken) return;
    try {
      const current = await api.currentUser();
      this.enterWorkspace(current);
    } catch (error) {
      if (wx.getStorageSync("jianjian-miniapp-refresh-token")) {
        this.setData({ error: error.message || "登录状态已失效，请重新登录。" });
        api.clearTokens();
      }
    }
  },

  async login() {
    this.setData({ busy: true, error: "" });
    try {
      const tenantId = this.data.selectedWorkspace.id || "";
      const result = await api.loginWithWeChat(tenantId);
      if (result.requiresWorkspaceSelection) {
        const workspaces = result.workspaces || [];
        if (!workspaces.length) throw new Error("当前账号没有可用的机构工作空间。");
        this.setData({
          workspaces,
          workspaceIndex: -1,
          selectedWorkspace: {},
          error: "账号加入了多个机构，请选择本次要进入的工作空间后再次登录。",
        });
        return;
      }
      if (!result.accessToken) throw new Error("登录未完成，请重试。");
      this.enterWorkspace(await api.currentUser());
    } catch (error) {
      this.setData({ error: error.message || "登录失败，请重试。" });
    } finally {
      this.setData({ busy: false });
    }
  },

  onWorkspaceChange(event) {
    const workspaceIndex = Number(event.detail.value);
    this.setData({
      workspaceIndex,
      selectedWorkspace: this.data.workspaces[workspaceIndex] || {},
      error: "",
    });
  },

  onNameInput(event) {
    this.setData({ displayName: event.detail.value });
  },

  async acceptInvitation() {
    const { invitationToken, displayName } = this.data;
    if (!displayName.trim()) {
      this.setData({ error: "请填写检测师姓名。" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      await api.acceptInvitation(invitationToken, displayName.trim());
      this.enterWorkspace(await api.currentUser());
    } catch (error) {
      this.setData({ error: error.message || "接受邀请失败，请重试。" });
    } finally {
      this.setData({ busy: false });
    }
  },

  enterWorkspace(user) {
    if (!user || !user.activeWorkspace || !user.activeWorkspace.tenantId) {
      throw new Error("当前账号没有有效的机构工作空间，请联系机构管理员。");
    }
    const app = getApp();
    app.globalData.user = user;
    app.globalData.tenantId = user.activeWorkspace.tenantId;
    wx.redirectTo({ url: "/pages/orders/index" });
  },
});
