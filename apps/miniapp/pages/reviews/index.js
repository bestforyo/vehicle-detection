const api = require("../../utils/api");

const STATUS_LABELS = {
  REVIEW_PENDING: "待审核",
};

Page({
  data: {
    reviews: [],
    loading: true,
    error: "",
    unauthorized: false,
  },

  onShow() {
    const app = getApp();
    if (app.globalData.workspaceRole !== "ORG_ADMIN") {
      this.setData({ unauthorized: true, loading: false });
      return;
    }
    this.loadReviews();
  },

  onPullDownRefresh() {
    this.loadReviews().finally(() => wx.stopPullDownRefresh());
  },

  async loadReviews() {
    this.setData({ loading: true, error: "" });
    try {
      const reviews = await api.api("/reviews");
      this.setData({
        reviews: reviews.map((review) => ({
          ...review,
          statusLabel: STATUS_LABELS[review.status] || review.status,
          vehicleLabel: [review.vehicle.brand, review.vehicle.model, review.vehicle.year].filter(Boolean).join(" "),
        })),
      });
    } catch (error) {
      this.setData({ error: error.message || "待审核列表加载失败。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  openReview(event) {
    const review = this.data.reviews[Number(event.currentTarget.dataset.index)];
    if (!review) return;
    wx.navigateTo({ url: `/pages/review-detail/index?orderId=${encodeURIComponent(review.id)}` });
  },
});
