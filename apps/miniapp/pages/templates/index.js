const api = require("../../utils/api");
const configuredTemplates = require("../../data/configured-templates.json").templates;
const CONFIGURED_CODES = configuredTemplates.map((template) => template.code);

Page({
  data: {
    templates: [],
    approvedStandards: [],
    approvedStandardLabels: [],
    loading: true,
    saving: false,
    error: "",
    isOrganizationAdmin: false,
    canImportConfigured: false,
    hasPartialConfiguredTemplates: false,
  },

  onShow() {
    this.isOrganizationAdmin = getApp().globalData.workspaceRole === "ORG_ADMIN";
    this.setData({ isOrganizationAdmin: this.isOrganizationAdmin });
    this.loadTemplates();
  },

  onPullDownRefresh() {
    this.loadTemplates().finally(() => wx.stopPullDownRefresh());
  },

  async loadTemplates() {
    this.setData({ loading: true, error: "" });
    try {
      const [templates, approvedStandards] = this.isOrganizationAdmin
        ? await Promise.all([
          api.api("/templates/management"),
          api.api("/templates/approved-standard-revisions"),
        ])
        : [await api.api("/templates"), []];
      const mapped = templates.filter((template) => template.revisions && template.revisions[0]).map((template) => {
        const revision = template.revisions[0];
        const standardRevisionId = revision.standardRevisionId || "";
        const selectedStandardIndex = Math.max(0, approvedStandards.findIndex((standard) => standard.id === standardRevisionId));
        return {
          ...template,
          itemCount: revision.schema.sections.reduce((sum, section) => sum + section.items.length, 0),
          vehicleKindLabel: template.vehicleKind === "PASSENGER_CAR" ? "乘用车" : "摩托车",
          usageLabel: template.usage === "NEW" ? "新车" : "二手车",
          isPublished: Boolean(revision.publishedAt),
          canPublish: Boolean(standardRevisionId && !revision.publishedAt),
          selectedStandardId: standardRevisionId,
          selectedStandardIndex,
          statusLabel: revision.publishedAt ? "已发布" : standardRevisionId ? "已关联标准·待复核" : "未关联标准·草稿",
          boundStandardLabel: template.standardRevision
            ? `${template.standardRevision.standard.code} · ${template.standardRevision.version}`
            : "",
          approvalRef: "",
          approvalNote: "",
        };
      });
      const existingCodes = mapped.map((template) => template.code).filter((code) => CONFIGURED_CODES.includes(code));
      this.setData({
        templates: mapped,
        approvedStandards,
        approvedStandardLabels: approvedStandards.map((standard) => `${standard.standard.code} · ${standard.version} · ${standard.standard.title}`),
        canImportConfigured: this.isOrganizationAdmin && existingCodes.length === 0,
        hasPartialConfiguredTemplates: this.isOrganizationAdmin && existingCodes.length > 0 && existingCodes.length < CONFIGURED_CODES.length,
      });
    } catch (error) {
      this.setData({ error: error.message || "模板加载失败。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async importConfigured() {
    if (!this.data.canImportConfigured || this.data.saving) return;
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: "导入八种原型清单？",
      content: "将以未发布草稿导入当前机构。关联已审批标准并完成机构复核前，模板不能用于生产建单。",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ saving: true, error: "" });
    try {
      await api.api("/templates/import-configured", {
        method: "POST",
        data: { templates: configuredTemplates },
      });
      wx.showToast({ title: "模板草稿已导入", icon: "success" });
      await this.loadTemplates();
    } catch (error) {
      this.setData({ error: error.message || "模板导入失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onStandardChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    const standardIndex = Number(event.detail.value);
    const template = this.data.templates[index];
    const standard = this.data.approvedStandards[standardIndex];
    if (!template || !standard) return;
    const templates = this.data.templates.slice();
    templates[index] = {
      ...template,
      selectedStandardId: standard.id,
      selectedStandardIndex: standardIndex,
    };
    this.setData({ templates });
  },

  async linkStandard(event) {
    const template = this.data.templates[Number(event.currentTarget.dataset.index)];
    const revision = template && template.revisions[0];
    if (!template || !revision || !template.selectedStandardId || this.data.saving) return;
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/templates/${encodeURIComponent(template.id)}/revisions/${encodeURIComponent(revision.id)}/standard`, {
        method: "POST",
        data: { standardRevisionId: template.selectedStandardId },
      });
      wx.showToast({ title: "已关联标准", icon: "success" });
      await this.loadTemplates();
    } catch (error) {
      this.setData({ error: error.message || "关联标准失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onApprovalRefInput(event) {
    this.updateTemplateField(event, "approvalRef");
  },

  onApprovalNoteInput(event) {
    this.updateTemplateField(event, "approvalNote");
  },

  updateTemplateField(event, field) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.templates[index]) return;
    const templates = this.data.templates.slice();
    templates[index] = { ...templates[index], [field]: event.detail.value };
    this.setData({ templates });
  },

  async publishTemplate(event) {
    const template = this.data.templates[Number(event.currentTarget.dataset.index)];
    const revision = template && template.revisions[0];
    if (!template || !revision || !template.canPublish || this.data.saving) return;
    if (!template.approvalRef.trim() || template.approvalRef.trim().length < 3
      || !template.approvalNote.trim() || template.approvalNote.trim().length < 10) {
      this.setData({ error: "请填写至少 3 个字符的机构复核单号和至少 10 个字符的复核说明。" });
      return;
    }
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/templates/${encodeURIComponent(template.id)}/revisions/${encodeURIComponent(revision.id)}/publish`, {
        method: "POST",
        data: { approvalRef: template.approvalRef.trim(), approvalNote: template.approvalNote.trim() },
      });
      wx.showToast({ title: "模板已审核发布", icon: "success" });
      await this.loadTemplates();
    } catch (error) {
      this.setData({ error: error.message || "模板发布失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  startOrder(event) {
    const template = this.data.templates[Number(event.currentTarget.dataset.index)];
    if (!template || !template.isPublished || template.vehicleKind !== "PASSENGER_CAR") {
      wx.showToast({ title: "此模板暂不可用于创建检测", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/create-order/index?templateRevisionId=${encodeURIComponent(template.revisions[0].id)}`,
    });
  },
});
