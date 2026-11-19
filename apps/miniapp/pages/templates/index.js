const api = require("../../utils/api");

Page({
  data: {
    templates: [],
    loading: true,
    error: "",
  },

  onShow() {
    this.loadTemplates();
  },

  onPullDownRefresh() {
    this.loadTemplates().finally(() => wx.stopPullDownRefresh());
  },

  async loadTemplates() {
    this.setData({ loading: true, error: "" });
    try {
      const templates = await api.api("/templates");
      this.setData({
        templates: templates.filter((template) => template.revisions && template.revisions[0]).map((template) => ({
          ...template,
          itemCount: template.revisions[0].schema.sections.reduce((sum, section) => sum + section.items.length, 0),
          vehicleKindLabel: template.vehicleKind === "PASSENGER_CAR" ? "乘用车" : "摩托车",
          usageLabel: template.usage === "NEW" ? "新车" : "二手车",
        })),
      });
    } catch (error) {
      this.setData({ error: error.message || "模板加载失败。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  startOrder(event) {
    const template = this.data.templates[Number(event.currentTarget.dataset.index)];
    if (!template || template.vehicleKind !== "PASSENGER_CAR") {
      wx.showToast({ title: "此车辆类型暂未开放创建检测", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/create-order/index?templateRevisionId=${encodeURIComponent(template.revisions[0].id)}`,
    });
  },
});
