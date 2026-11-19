const config = require("../config");

const ACCESS_TOKEN_KEY = "jianjian-miniapp-access-token";
const REFRESH_TOKEN_KEY = "jianjian-miniapp-refresh-token";
let accessToken = wx.getStorageSync(ACCESS_TOKEN_KEY) || "";
let refreshInFlight = null;

function getApiBaseUrl() {
  const baseUrl = (config.apiBaseUrl || "").replace(/\/+$/, "");
  if (!baseUrl || baseUrl.includes("your-domain.example")) {
    throw new Error("小程序 API 地址尚未配置，请联系平台管理员。");
  }
  return baseUrl;
}

function request(path, options) {
  const configOptions = options || {};
  const headers = Object.assign({}, configOptions.header || {});
  const body = configOptions.data;
  if (body && typeof body === "object" && !(body instanceof ArrayBuffer)) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getApiBaseUrl()}${path}`,
      method: configOptions.method || "GET",
      data: body,
      header: headers,
      timeout: 20000,
      success: (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const payload = response.data || {};
          const message = Array.isArray(payload.message)
            ? payload.message.join("；")
            : payload.message;
          const error = new Error(message || `请求失败（${response.statusCode}）`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(response.data);
      },
      fail: (error) => reject(new Error(error.errMsg || "网络请求失败，请检查网络设置。")),
    });
  });
}

function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = wx.getStorageSync(REFRESH_TOKEN_KEY);
  if (!refreshToken) return Promise.resolve(false);
  refreshInFlight = request("/auth/refresh", {
    method: "POST",
    data: { refreshToken },
  }).then((tokens) => {
    saveTokens(tokens);
    return true;
  }).catch(() => {
    clearTokens();
    return false;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function api(path, options) {
  return request(path, options).catch(async (error) => {
    if (error.statusCode !== 401 || !(await refreshAccessToken())) {
      throw error;
    }
    return request(path, options);
  });
}

function saveTokens(tokens) {
  if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
    throw new Error("服务器没有返回有效的登录会话。");
  }
  accessToken = tokens.accessToken;
  wx.setStorageSync(ACCESS_TOKEN_KEY, tokens.accessToken);
  wx.setStorageSync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

function clearTokens() {
  accessToken = "";
  wx.removeStorageSync(ACCESS_TOKEN_KEY);
  wx.removeStorageSync(REFRESH_TOKEN_KEY);
}

function loginWithWeChat(tenantId) {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async ({ code }) => {
        if (!code) {
          reject(new Error("微信登录凭证获取失败，请重试。"));
          return;
        }
        try {
          const result = await request("/auth/wechat/session", {
            method: "POST",
            data: { code, ...(tenantId ? { tenantId } : {}) },
          });
          if (result.accessToken && result.refreshToken) saveTokens(result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => reject(new Error(error.errMsg || "微信登录失败，请重试。")),
    });
  });
}

function acceptInvitation(invitationToken, displayName) {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async ({ code }) => {
        if (!code) {
          reject(new Error("微信登录凭证获取失败，请重试。"));
          return;
        }
        try {
          const result = await request("/auth/wechat/accept-invitation", {
            method: "POST",
            data: { code, invitationToken, displayName },
          });
          saveTokens(result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => reject(new Error(error.errMsg || "微信登录失败，请重试。")),
    });
  });
}

function currentUser() {
  return api("/auth/me");
}

function logout() {
  return api("/auth/logout", { method: "POST" }).finally(clearTokens);
}

module.exports = {
  api,
  acceptInvitation,
  clearTokens,
  currentUser,
  getApiBaseUrl,
  loginWithWeChat,
  logout,
  saveTokens,
};
