const api = require("../../utils/api");

const ANSWER_LABELS = {
  LESS_THAN_30CM_X_30CM: "小于 30cm × 30cm",
  GREATER_THAN_30CM_X_30CM: "大于 30cm × 30cm",
};

Page({
  data: {
    order: {},
    revision: {},
    sections: [],
    conclusion: "",
    returnComment: "",
    loading: true,
    saving: false,
    error: "",
    previewError: "",
    unauthorized: false,
  },

  onLoad(query) {
    this.orderId = typeof query.orderId === "string" ? query.orderId : "";
    if (!this.orderId) {
      this.setData({ error: "检测订单编号缺失。", loading: false });
      return;
    }
    this.loadReview();
  },

  async loadReview() {
    if (getApp().globalData.workspaceRole !== "ORG_ADMIN") {
      this.setData({ unauthorized: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const order = await api.api(`/reviews/${encodeURIComponent(this.orderId)}`);
      const revision = order.revision;
      const answers = Object.fromEntries((revision.answers || []).map((entry) => [entry.itemKey, entry.answer || {}]));
      const evidence = {};
      (revision.evidence || []).forEach((entry) => {
        if (!evidence[entry.itemKey]) evidence[entry.itemKey] = [];
        evidence[entry.itemKey].push(entry);
      });
      const sections = revision.schema.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          const answer = answers[item.key] || {};
          const photos = (evidence[item.key] || []).map((entry) => ({
            ...entry,
            statusLabel: entry.scanStatus === "CLEAN" ? "安全检查通过" : "不可用",
          }));
          return {
            ...item,
            result: answer.value || "未填写",
            resultLabel: `${answer.value || "未填写"}${ANSWER_LABELS[answer.thresholdFinding] ? ` · ${ANSWER_LABELS[answer.thresholdFinding]}` : ""}`,
            note: answer.note || "",
            photos,
          };
        }),
      }));
      this.setData({ order, revision, sections });
      await this.loadPhotoPreviews();
    } catch (error) {
      this.setData({ error: error.message || "审核详情加载失败。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadPhotoPreviews() {
    const entries = this.data.sections.flatMap((section) => section.items.flatMap((item) => item.photos));
    const previews = await Promise.all(entries.map(async (entry) => {
      if (entry.scanStatus !== "CLEAN") return { assetId: entry.assetId, url: "", failed: false };
      try {
        const result = await api.api(`/media/${encodeURIComponent(entry.assetId)}/preview-url`, { method: "POST" });
        return { assetId: entry.assetId, url: result.url, failed: false };
      } catch {
        return { assetId: entry.assetId, url: "", failed: true };
      }
    }));
    const urlByAssetId = Object.fromEntries(previews.map((preview) => [preview.assetId, preview.url]));
    const sections = this.data.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        photos: item.photos.map((photo) => ({
          ...photo,
          previewUrl: urlByAssetId[photo.assetId] || "",
          statusLabel: photo.scanStatus !== "CLEAN"
            ? "照片安全检查未通过"
            : urlByAssetId[photo.assetId]
              ? "安全检查通过"
              : "照片预览加载失败",
        })),
      })),
    }));
    const unsafeEvidence = entries.some((entry) => entry.scanStatus !== "CLEAN");
    const previewError = unsafeEvidence
      ? "有现场照片未通过安全检查，不能审核通过；请联系检测师重新上传。"
      : previews.some((preview) => preview.failed)
        ? "部分现场照片无法加载。为确保审核完整，请刷新后重试；照片未能预览时不能通过审核。"
        : "";
    this.setData({ sections, previewError });
  },

  onConclusionInput(event) {
    this.setData({ conclusion: event.detail.value });
  },

  onReturnCommentInput(event) {
    this.setData({ returnComment: event.detail.value });
  },

  async approve() {
    if (this.data.saving) return;
    if (this.data.previewError) {
      this.setData({ error: this.data.previewError });
      return;
    }
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: "确认通过审核？",
      content: "通过后将生成正式报告，此操作不可撤回。",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/reviews/${encodeURIComponent(this.orderId)}/approve`, {
        method: "POST",
        data: {
          revisionId: this.data.revision.id,
          ...(this.data.conclusion.trim() ? { professionalConclusion: this.data.conclusion.trim() } : {}),
        },
      });
      wx.showToast({ title: "已审核并生成报告", icon: "success" });
      wx.redirectTo({ url: "/pages/reviews/index" });
    } catch (error) {
      this.setData({ error: error.message || "审核通过失败，请刷新后重试。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  async returnForModification() {
    if (this.data.saving) return;
    const comment = this.data.returnComment.trim();
    if (!comment) {
      this.setData({ error: "请填写具体退回意见，帮助检测师完成修改。" });
      return;
    }
    this.setData({ saving: true, error: "" });
    try {
      await api.api(`/reviews/${encodeURIComponent(this.orderId)}/return`, {
        method: "POST",
        data: { revisionId: this.data.revision.id, comment },
      });
      wx.showToast({ title: "已退回检测师修改", icon: "success" });
      wx.redirectTo({ url: "/pages/reviews/index" });
    } catch (error) {
      this.setData({ error: error.message || "退回失败，请刷新后重试。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  previewPhoto(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: "照片预览暂不可用", icon: "none" });
      return;
    }
    const urls = this.data.sections.flatMap((section) => section.items.flatMap((item) => item.photos
      .map((photo) => photo.previewUrl)
      .filter(Boolean)));
    wx.previewImage({ current: url, urls });
  },
});
