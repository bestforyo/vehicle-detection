import { ClipboardCheck } from "lucide-react";

export default function WorkforceEntryApp() {
  return (
    <main style={{
      alignItems: "center",
      background: "#f5f7f5",
      boxSizing: "border-box",
      color: "#344a40",
      display: "flex",
      justifyContent: "center",
      minHeight: "100vh",
      padding: 24,
    }}>
      <section style={{
        background: "#fff",
        border: "1px solid #e5ebe7",
        borderRadius: 18,
        maxWidth: 480,
        padding: "32px 28px",
        textAlign: "center",
        width: "100%",
      }}>
        <div style={{
          alignItems: "center",
          background: "#edf4ed",
          borderRadius: 12,
          color: "#4d795d",
          display: "flex",
          height: 48,
          justifyContent: "center",
          margin: "0 auto 18px",
          width: 48,
        }}><ClipboardCheck size={24} /></div>
        <p style={{ color: "#70857b", fontSize: 12, letterSpacing: 1.5, margin: "0 0 8px" }}>鉴见 · 车辆检测</p>
        <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>机构工作台请使用微信小程序</h1>
        <p style={{ color: "#71817a", fontSize: 14, lineHeight: 1.8, margin: "0 0 22px" }}>
          检测师和机构管理员使用同一个「鉴见检测」微信小程序。订单检测、机构审核与成员管理等机构工作流不在后台 Web 提供。
        </p>
        <div style={{
          background: "#edf4ed",
          borderRadius: 9,
          color: "#376d57",
          display: "inline-block",
          fontSize: 14,
          padding: "11px 16px",
        }}>请在微信中打开「鉴见检测」小程序</div>
        <p style={{ color: "#97a29c", fontSize: 12, lineHeight: 1.7, margin: "12px 0 0" }}>AppID：wx17203f85eb5bc06f</p>
        <p style={{ color: "#97a29c", fontSize: 12, lineHeight: 1.7, margin: "18px 0 0" }}>
          平台运营人员请前往 <a href="/admin" style={{ color: "#376d57" }}>平台运营后台</a> 登录。
        </p>
      </section>
    </main>
  );
}
