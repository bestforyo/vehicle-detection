const api = require("../../utils/api");

Page({
  data: {
    templates: [],
    templateIndex: 0,
    selectedTemplate: {},
    busy: false,
    error: "",
    success: "",
    form: { brand: "", model: "", year: "", mileage: "", plate: "", vin: "" },
  },

  onLoad(query) {
    this.preselectedRevisionId = typeof query.templateRevisionId === "string" ? query.templateRevisionId : "";
    this.loadTemplates();
  },

  async loadTemplates() {
    try {
      const data = await api.api("/templates");
      const templates = data.filter((template) =>
        template.vehicleKind === "PASSENGER_CAR" && template.revisions && template.revisions[0],
      ).map((template) => ({
        ...template,
        label: `${template.title} · ${template.standardType} · ${template.usage === "NEW" ? "新车" : "二手车"}`,
      }));
      const foundIndex = templates.findIndex((template) => template.revisions[0].id === this.preselectedRevisionId);
      const templateIndex = foundIndex >= 0 ? foundIndex : 0;
      this.setData({
        templates,
        templateIndex,
        selectedTemplate: templates[templateIndex] || {},
      });
    } catch (error) {
      this.setData({ error: error.message || "加载检测模板失败。" });
    }
  },

  onTemplateChange(event) {
    const templateIndex = Number(event.detail.value);
    this.setData({
      templateIndex,
      selectedTemplate: this.data.templates[templateIndex] || {},
    });
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  async createOrder() {
    const { form, selectedTemplate } = this.data;
    if (!selectedTemplate.id) {
      this.setData({ error: "当前机构尚无已发布的乘用车模板，请联系管理员完成审核。" });
      return;
    }
    if (!form.brand.trim() || !form.model.trim()) {
      this.setData({ error: "请填写车辆品牌和车型。" });
      return;
    }
    if (!form.plate.trim() && !form.vin.trim()) {
      this.setData({ error: "车牌号和车架号至少填写一项。" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      const order = await api.api("/orders", {
        method: "POST",
        header: { "Idempotency-Key": `mini-${Date.now()}-${Math.random().toString(36).slice(2, 14)}` },
        data: {
          templateRevisionId: selectedTemplate.revisions[0].id,
          vehicleKind: "PASSENGER_CAR",
          brand: form.brand.trim(),
          model: form.model.trim(),
          ...(form.year ? { year: Number(form.year) } : {}),
          ...(form.mileage ? { mileage: Number(form.mileage) } : {}),
          ...(form.plate.trim() ? { plate: form.plate.trim() } : {}),
          ...(form.vin.trim() ? { vin: form.vin.trim().toUpperCase() } : {}),
        },
      });
      getApp().globalData.lastCreatedOrderId = order.id;
      wx.redirectTo({ url: `/pages/inspection/index?orderId=${encodeURIComponent(order.id)}` });
    } catch (error) {
      this.setData({ error: error.message || "创建检测订单失败。" });
    } finally {
      this.setData({ busy: false });
    }
  },
});
