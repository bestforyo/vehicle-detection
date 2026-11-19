import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileCheck2, ShieldCheck } from "lucide-react";
import { publicApi } from "../admin/api";
import "./public-report.css";

type ReportSection = {
  key: string;
  title: string;
  items: Array<{ key: string; title: string; guidance?: string }>;
};
type PublicSnapshot = {
  reportNo: string;
  orderNo: string;
  publishedAt: string;
  tenant: { name: string; displayName: string; reportDisclaimer: string | null };
  vehicle: {
    kind: string;
    brand: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
    plate: string | null;
    vin: string | null;
    firstRegisteredAt: string | null;
  };
  template: {
    title: string;
    standardType: string;
    standardVersion: string | null;
    standardEffectiveAt: string | null;
    coverageScope: string | null;
    standardLicenseRef: string | null;
    revisionNumber: number;
    approvalRef: string;
  };
  inspector: { displayName: string };
  professionalConclusion: string | null;
  schema: { sections: ReportSection[] };
  answers: Array<{ itemKey: string; value: string }>;
  evidence: Array<{ itemKey: string; assetId: string; caption: string | null }>;
};
type PublicReportResponse = {
  report: PublicSnapshot;
  reportNo: string;
  publishedAt: string;
  expiresAt: string;
};

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN");
}

export default function PublicReportApp() {
  const token = useMemo(() => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }, []);
  const [data, setData] = useState<PublicReportResponse | null>(null);
  const [error, setError] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [assetErrors, setAssetErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void publicApi<PublicReportResponse>(`/public/reports/${encodeURIComponent(token)}`)
      .then((report) => { if (active) setData(report); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [token]);

  const evidence = data?.report.evidence ?? [];
  useEffect(() => {
    if (data) document.title = `${data.report.tenant.displayName || data.report.tenant.name} · 检测报告`;
  }, [data]);
  useEffect(() => {
    if (!token || !evidence.length) return;
    let active = true;
    void Promise.all(evidence.map(async (entry) => {
      try {
        const result = await publicApi<{ url: string }>(
          `/public/reports/${encodeURIComponent(token)}/assets/${encodeURIComponent(entry.assetId)}/preview-url`,
        );
        return [entry.assetId, result.url] as const;
      } catch {
        if (active) setAssetErrors((previous) => previous.includes(entry.assetId) ? previous : [...previous, entry.assetId]);
        return null;
      }
    })).then((results) => {
      if (active) setAssetUrls(Object.fromEntries(results.filter((entry): entry is readonly [string, string] => entry !== null)));
    });
    return () => { active = false; };
  }, [evidence, token]);

  if (error || !token) {
    return <main className="public-h5 public-h5--unavailable"><div className="public-unavailable-card"><AlertCircle size={28} /><h1>报告链接不可用</h1><p>该分享可能已过期、撤销或报告暂不可访问。请向签发机构确认链接状态。</p></div></main>;
  }
  if (!data) return <main className="public-h5 public-h5--loading"><span />正在安全加载报告…</main>;

  const report = data.report;
  const answers = new Map(report.answers.map((answer) => [answer.itemKey, answer.value]));
  const evidenceByItem = new Map<string, typeof report.evidence>();
  report.evidence.forEach((entry) => evidenceByItem.set(entry.itemKey, [...(evidenceByItem.get(entry.itemKey) ?? []), entry]));

  return <main className="public-h5">
    <header className="public-h5-header"><span className="public-h5-logo"><ShieldCheck size={18} /></span><span><strong>鉴见</strong><small>VEHICLE INSPECTION REPORT</small></span><i>已审核发布</i></header>
    <section className="public-h5-cover">
      <p>正式检测报告</p>
      <h1>{report.tenant.displayName || report.tenant.name}</h1>
      <div className="public-h5-cover-meta"><span>报告编号</span><strong>{data.reportNo}</strong><span>签发日期</span><strong>{dateText(data.publishedAt)}</strong></div>
    </section>
    <div className="public-h5-body">
      <section className="public-h5-summary">
        <div><p className="public-h5-label">VEHICLE</p><h2>{[report.vehicle.brand, report.vehicle.model, report.vehicle.year].filter(Boolean).join(" ") || report.vehicle.kind}</h2><p>{report.vehicle.plate || "车牌未公开"} · {report.vehicle.kind}</p></div>
        <div className="public-h5-vehicle-meta"><span>订单编号<strong>{report.orderNo}</strong></span><span>检测套餐<strong>{report.template.title}</strong></span><span>检测师<strong>{report.inspector.displayName}</strong></span><span>表显里程<strong>{report.vehicle.mileage == null ? "未记录" : `${report.vehicle.mileage.toLocaleString()} km`}</strong></span></div>
      </section>

      <section className="public-h5-section"><div className="public-h5-section-title"><div><p className="public-h5-label">CONCLUSION</p><h2>检测结论</h2></div><FileCheck2 size={20} /></div>
        <p className="public-h5-conclusion">{report.professionalConclusion || "本报告展示本次检测项目及记录。报告内容仅适用于本次检测范围，不构成对车辆未来状态的保证。"}</p>
      </section>

      <section className="public-h5-section"><div className="public-h5-section-title"><div><p className="public-h5-label">INSPECTION RESULTS</p><h2>检测结果</h2></div></div>
        {report.schema.sections.map((section, index) => <details className="public-h5-module" key={section.key} open={index === 0}>
          <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{section.title}</strong><small>{section.items.length} 项</small></summary>
          <div className="public-h5-items">{section.items.map((item) => {
            const value = answers.get(item.key);
            const itemEvidence = evidenceByItem.get(item.key) ?? [];
            return <article className="public-h5-item" key={item.key}><div className="public-h5-item-heading"><strong>{item.title}</strong><span className={value && value !== "正常" ? "public-h5-result public-h5-result--finding" : "public-h5-result"}>{value || "未记录"}</span></div>
              {item.guidance && <p className="public-h5-guidance">{item.guidance}</p>}
              {!!itemEvidence.length && <div className="public-h5-photos">{itemEvidence.map((photo) => <figure key={photo.assetId}>{assetUrls[photo.assetId] ? <img alt={photo.caption || item.title} loading="lazy" referrerPolicy="no-referrer" src={assetUrls[photo.assetId]} /> : <div className="public-h5-photo-missing">{assetErrors.includes(photo.assetId) ? "照片暂不可用" : "照片加载中"}</div>}{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div>}
            </article>;
          })}</div>
        </details>)}
      </section>

      <section className="public-h5-section"><div className="public-h5-section-title"><div><p className="public-h5-label">STANDARD & SCOPE</p><h2>依据与适用范围</h2></div></div>
        <dl className="public-h5-standard"><dt>模板</dt><dd>{report.template.title} · 第 {report.template.revisionNumber} 版</dd><dt>标准类型</dt><dd>{report.template.standardType} · {report.template.standardVersion || "版本未记录"}</dd><dt>适用范围</dt><dd>{report.template.coverageScope || "以本次实际检测项目为准"}</dd><dt>报告有效期</dt><dd>分享链接有效至 {dateText(data.expiresAt)}</dd></dl>
      </section>
      <footer className="public-h5-footer"><p>{report.tenant.reportDisclaimer || "本报告为签发机构基于本次检测记录出具的结果。检测结论受检测范围、现场条件及车辆状态影响，不构成未来状态保证。"}</p><small>报告版本以签发时快照为准 · 未经授权不得篡改或用于超出适用范围的用途</small></footer>
    </div>
  </main>;
}
