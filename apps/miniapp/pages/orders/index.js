const api = require("../../utils/api");

const STATUS_LABELS = {
  INSPECTING: "检测中",
  REVIEW_PENDING: "待审核",
  NEEDS_MODIFICATION: "待修改",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

Page({
  data: {
    orders: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    error: "",
    workspaceName: "",
    isOrganizationAdmin: false,
  },

  onShow() {
    const app = getApp();
    const user = app.globalData.user;
    if (user && user.activeWorkspace) {
      const membership = user.memberships.find((item) => item.tenant.id === user.activeWorkspace.tenantId);
      this.setData({
        workspaceName: membership ? membership.tenant.name : "机构工作空间",
        isOrganizationAdmin: user.activeWorkspace.role === "ORG_ADMIN",
      });
    }
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh());
  },

  async loadOrders() {
    this.setData({ loading: true, error: "" });
    try {
      const orders = await api.api("/orders?limit=50");
      this.setData({
        orders: orders.map((order) => ({ ...order, statusLabel: STATUS_LABELS[order.status] || order.status })),
        hasMore: orders.length === 50,
      });
    } catch (error) {
      if (/请先登录|Unauthorized/i.test(error.message)) {
        wx.redirectTo({ url: "/pages/login/index" });
      } else {
        this.setData({ error: error.message || "订单加载失败。" });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMore() {
    const cursor = this.data.orders[this.data.orders.length - 1];
    if (!cursor || !this.data.hasMore) return;
    this.setData({ loadingMore: true, error: "" });
    try {
      const next = await api.api(`/orders?limit=50&cursor=${encodeURIComponent(cursor.id)}`);
      this.setData({
        orders: this.data.orders.concat(next.map((order) => ({
          ...order,
          statusLabel: STATUS_LABELS[order.status] || order.status,
        }))),
        hasMore: next.length === 50,
      });
    } catch (error) {
      this.setData({ error: error.message || "加载更早的订单失败。" });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  createOrder() {
    wx.navigateTo({ url: "/pages/create-order/index" });
  },

  openTemplates() {
    wx.navigateTo({ url: "/pages/templates/index" });
  },

  openReviews() {
    if (getApp().globalData.workspaceRole !== "ORG_ADMIN") return;
    wx.navigateTo({ url: "/pages/reviews/index" });
  },

  openOrganization() {
    if (getApp().globalData.workspaceRole !== "ORG_ADMIN") return;
    wx.navigateTo({ url: "/pages/organization/index" });
  },

  openOrder(event) {
    wx.navigateTo({ url: `/pages/inspection/index?orderId=${encodeURIComponent(event.currentTarget.dataset.id)}` });
  },

  async logout() {
    try {
      await api.logout();
    } catch (error) {
      api.clearTokens();
      this.setData({ error: error.message || "退出会话时遇到网络问题，本地会话已清除。" });
    }
    getApp().globalData.user = null;
    getApp().globalData.tenantId = "";
    getApp().globalData.workspaceRole = "";
    wx.redirectTo({ url: "/pages/login/index" });
  },
});
