const api = require("../../utils/api");

const THRESHOLD_VALUES = [
  { value: "LESS_THAN_30CM_X_30CM", label: "小于 30cm × 30cm" },
  { value: "GREATER_THAN_30CM_X_30CM", label: "大于 30cm × 30cm" },
];

const STATUS_LABELS = {
  INSPECTING: "检测中",
  REVIEW_PENDING: "待审核",
  NEEDS_MODIFICATION: "待修改",
  COMPLETED: "已完成",
};

function emptyAnswer() {
  return { value: "", note: "", thresholdFinding: "", evidenceAssetIds: [] };
}

Page({
  data: {
    order: {},
    revision: {},
    sections: [],
    sectionOptions: [],
    sectionIndex: 0,
    activeSection: {},
    displayItems: [],
    answers: {},
    editable: false,
    saving: false,
    error: "",
    notice: "",
    statusLabel: "",
    thresholdLabels: THRESHOLD_VALUES.map((item) => item.label),
  },

  onLoad(query) {
    this.orderId = typeof query.orderId === "string" ? query.orderId : "";
    if (!this.orderId) {
      this.setData({ error: "检测订单编号缺失。" });
      return;
    }
    this.loadOrder();
  },

  async loadOrder() {
    this.setData({ error: "" });
    try {
      const order = await api.api(`/orders/${encodeURIComponent(this.orderId)}`);
      const revision = order.revisions && order.revisions[0];
      if (!revision) throw new Error("检测订单没有可读取的版本。");
      const answers = {};
      revision.schema.sections.forEach((section) => section.items.forEach((item) => {
        answers[item.key] = emptyAnswer();
      }));
      (revision.answers || []).forEach((answer) => {
        answers[answer.itemKey] = {
          ...answers[answer.itemKey],
          value: answer.value,
          note: answer.note || "",
          thresholdFinding: answer.thresholdFinding || "",
        };
      });
      (revision.evidence || []).forEach((entry) => {
        answers[entry.itemKey].evidenceAssetIds.push(entry.assetId);
      });
      this.setData({
        order,
        revision,
        sections: revision.schema.sections,
        sectionOptions: revision.schema.sections.map((section) => section.title),
        sectionIndex: 0,
        answers,
        editable: ["INSPECTING", "NEEDS_MODIFICATION"].includes(order.status) && revision.status === "DRAFT",
        statusLabel: STATUS_LABELS[order.status] || order.status,
      });
      this.refreshSection();
    } catch (error) {
      this.setData({ error: error.message || "检测订单加载失败。" });
    }
  },

  refreshSection() {
    const section = this.data.sections[this.data.sectionIndex];
    if (!section) return;
    const displayItems = section.items.map((item) => {
      const answer = this.data.answers[item.key] || emptyAnswer();
      const thresholdIndex = THRESHOLD_VALUES.findIndex((entry) => entry.value === answer.thresholdFinding);
      return {
        ...item,
        options: item.options || [],
        answer: {
          ...answer,
          thresholdFindingLabel: thresholdIndex >= 0 ? THRESHOLD_VALUES[thresholdIndex].label : "",
        },
        resultIndex: Math.max(0, item.options ? item.options.indexOf(answer.value) : -1),
        thresholdIndex: Math.max(0, thresholdIndex),
        needsThreshold: item.thresholdRequiredWhen.includes(answer.value),
        needsNote: item.noteRequiredWhen.includes(answer.value),
        needsEvidence: item.evidenceRequiredWhen.includes(answer.value),
      };
    });
    this.setData({ activeSection: section, displayItems });
  },

  onSectionChange(event) {
    this.setData({ sectionIndex: Number(event.detail.value) });
    this.refreshSection();
  },

  previousSection() {
    if (this.data.sectionIndex <= 0) return;
    this.setData({ sectionIndex: this.data.sectionIndex - 1 });
    this.refreshSection();
  },

  nextSection() {
    if (this.data.sectionIndex >= this.data.sections.length - 1) return;
    this.setData({ sectionIndex: this.data.sectionIndex + 1 });
    this.refreshSection();
  },

  updateAnswer(itemKey, patch) {
    const answer = { ...(this.data.answers[itemKey] || emptyAnswer()), ...patch };
    const answers = { ...this.data.answers, [itemKey]: answer };
    this.setData({ answers });
    this.refreshSection();
  },

  onResultChange(event) {
    if (!this.data.editable) return;
    const itemKey = event.currentTarget.dataset.key;
    const item = this.data.activeSection.items.find((candidate) => candidate.key === itemKey);
    if (!item) return;
    const result = item.options[Number(event.detail.value)] || "";
    const patch = { value: result };
    if (!item.thresholdRequiredWhen.includes(result)) patch.thresholdFinding = "";
    this.updateAnswer(itemKey, patch);
  },

  onValueInput(event) {
    if (!this.data.editable) return;
    this.updateAnswer(event.currentTarget.dataset.key, { value: event.detail.value });
  },

  onNoteInput(event) {
    if (!this.data.editable) return;
    this.updateAnswer(event.currentTarget.dataset.key, { note: event.detail.value });
  },

  onThresholdChange(event) {
    if (!this.data.editable) return;
    const selected = THRESHOLD_VALUES[Number(event.detail.value)];
    if (selected) this.updateAnswer(event.currentTarget.dataset.key, { thresholdFinding: selected.value });
  },

  async addPhoto(event) {
    const itemKey = event.currentTarget.dataset.key;
    const item = this.data.activeSection.items.find((candidate) => candidate.key === itemKey);
    if (!item || !this.data.editable) return;
    if (this.data.answers[itemKey].evidenceAssetIds.length >= 10) {
      wx.showToast({ title: "每个检测项最多上传 10 张照片", icon: "none" });
      return;
    }
    try {
      const chosen = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 10 - this.data.answers[itemKey].evidenceAssetIds.length,
          mediaType: ["image"],
          sourceType: ["camera", "album"],
          sizeType: ["compressed"],
          success: (result) => resolve(result.tempFiles || []),
          fail: reject,
        });
      });
      if (!chosen.length) return;
      this.setData({ saving: true, error: "", notice: "" });
      for (const file of chosen) {
        const assetId = await this.uploadEvidence(itemKey, file);
        const currentIds = this.data.answers[itemKey].evidenceAssetIds;
        this.updateAnswer(itemKey, { evidenceAssetIds: [...currentIds, assetId] });
      }
      this.setData({ notice: `${chosen.length} 张现场照片已完成安全处理，保存草稿后关联到检测版本。` });
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || "")) {
        this.setData({ error: error.message || error.errMsg || "现场照片上传失败。" });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  async uploadEvidence(itemKey, file) {
    const compressedPath = await new Promise((resolve, reject) => {
      wx.compressImage({
        src: file.tempFilePath,
        quality: 78,
        success: (result) => resolve(result.tempFilePath),
        fail: () => resolve(file.tempFilePath),
      });
    });
    const info = await new Promise((resolve, reject) => {
      wx.getFileInfo({ filePath: compressedPath, success: resolve, fail: reject });
    });
    const mimeType = file.type === "video" ? "" : (file.tempFilePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    if (!mimeType || info.size > 20 * 1024 * 1024) {
      throw new Error("照片格式不支持或超过 20 MB。请使用 JPEG/PNG 并缩小照片后重试。");
    }
    const intent = await api.api("/media/upload-intents", {
      method: "POST",
      data: {
        orderId: this.data.order.id,
        revisionId: this.data.revision.id,
        itemKey,
        fileName: compressedPath.split("/").pop() || "inspection.jpg",
        mimeType,
        sizeBytes: info.size,
      },
    });
    if (info.size > intent.maxBytes) {
      throw new Error(`照片超过当前设置的单文件限制（${Math.floor(intent.maxBytes / 1024 / 1024)} MB）。`);
    }
    const fileData = await new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: compressedPath,
        success: (result) => resolve(result.data),
        fail: reject,
      });
    });
    const uploadResult = await new Promise((resolve, reject) => {
      wx.request({
        url: intent.uploadUrl,
        method: "PUT",
        data: fileData,
        header: intent.uploadHeaders,
        timeout: 60000,
        success: (result) => {
          if (result.statusCode >= 200 && result.statusCode < 300) resolve(result);
          else reject(new Error(`现场照片上传失败（${result.statusCode}）。`));
        },
        fail: (error) => reject(new Error(error.errMsg || "连接对象存储失败。")),
      });
    });
    if (!uploadResult) throw new Error("现场照片上传失败。");
    await api.api(`/media/${intent.assetId}/complete`, {
      method: "POST",
      data: { assetId: intent.assetId },
    });
    return intent.assetId;
  },

  validateAnswers() {
    for (const section of this.data.sections) {
      for (const item of section.items) {
        const answer = this.data.answers[item.key] || emptyAnswer();
        if (item.required && !answer.value.trim()) return `请完成“${item.title}”。`;
        if (item.noteRequiredWhen.includes(answer.value) && !answer.note.trim()) return `请为“${item.title}”补充说明。`;
        if (item.thresholdRequiredWhen.includes(answer.value) && !answer.thresholdFinding) return `请为“${item.title}”完成尺寸判定。`;
        if (item.evidenceRequiredWhen.includes(answer.value) && !answer.evidenceAssetIds.length) return `请为“${item.title}”添加现场照片。`;
      }
    }
    return "";
  },

  buildAnswers() {
    return this.data.sections.flatMap((section) => section.items.map((item) => {
      const answer = this.data.answers[item.key] || emptyAnswer();
      return {
        itemKey: item.key,
        value: answer.value,
        ...(answer.note.trim() ? { note: answer.note.trim() } : {}),
        ...(answer.thresholdFinding ? { thresholdFinding: answer.thresholdFinding } : {}),
        evidenceAssetIds: answer.evidenceAssetIds,
      };
    }));
  },

  async persistDraft() {
    const saved = await api.api(`/orders/${encodeURIComponent(this.data.order.id)}/inspection/draft`, {
      method: "PUT",
      data: {
        revisionId: this.data.revision.id,
        revisionUpdatedAt: this.data.revision.updatedAt,
        answers: this.buildAnswers(),
      },
    });
    const revision = { ...this.data.revision, updatedAt: saved.updatedAt };
    this.setData({ revision });
  },

  async saveDraft() {
    if (!this.data.editable || this.data.saving) return;
    this.setData({ saving: true, error: "", notice: "" });
    try {
      await this.persistDraft();
      this.setData({ notice: "检测草稿已保存到机构业务系统。" });
    } catch (error) {
      this.setData({ error: error.message || "保存检测草稿失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },

  async submitInspection() {
    if (!this.data.editable || this.data.saving) return;
    const validationError = this.validateAnswers();
    if (validationError) {
      this.setData({ error: validationError });
      return;
    }
    const confirmation = await new Promise((resolve) => wx.showModal({
      title: "提交审核",
      content: "提交后当前检测版本将锁定，确认所有检测结果和照片均准确吗？",
      confirmText: "提交审核",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmation) return;
    this.setData({ saving: true, error: "", notice: "" });
    try {
      await this.persistDraft();
      await api.api(`/orders/${encodeURIComponent(this.data.order.id)}/inspection/submit`, {
        method: "POST",
        data: { revisionId: this.data.revision.id },
      });
      this.setData({
        editable: false,
        statusLabel: STATUS_LABELS.REVIEW_PENDING,
        "order.status": "REVIEW_PENDING",
        notice: "检测已提交审核并锁定当前版本。",
      });
    } catch (error) {
      this.setData({ error: error.message || "提交审核失败。" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
