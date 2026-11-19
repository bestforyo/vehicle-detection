import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bike,
  Camera,
  CarFront,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  ImagePlus,
  Info,
  Link2,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type VehicleKind = "乘用车" | "摩托车";
type Status = "待检测" | "检测中" | "待审核" | "待修改" | "已完成";
type Screen = "home" | "orders" | "templates" | "create" | "inspect" | "review" | "profile" | "report";
type Template = {
  id: string;
  name: string;
  kind: VehicleKind;
  vehicleType: string;
  packageType?: PassengerPackageType;
  standardType: "国标" | "团标" | "摩托车规范" | "机构标准";
  standard: string;
  description: string;
  sections: string[];
  itemCount: number;
  pendingSections?: string[];
};
type PassengerStandard = "国标" | "团标";
type PassengerPackageType = "三非排查" | "四非排查" | "整车检测" | "新车检测" | "新能源检测";
type OrganizationRole = "检测师" | "机构管理员";
type InspectionItem = {
  name: string;
  section: string;
  result: string;
  options?: string[];
  material?: "塑料件" | "金属件";
  customResult?: string;
  customNoteResults?: string[];
  customNoteLabel?: string;
  customNotePrompt?: string;
  waterNote?: string;
  requiresWaterNote?: boolean;
  decisionType?: "关键决定项" | "非关键决定项";
  thresholdOptions?: string[];
  thresholdFinding?: "大于30cm×30cm" | "小于30cm×30cm";
  note?: string;
  photo?: boolean;
  photoUrl?: string;
};
type Order = {
  id: string;
  templateId: string;
  vehicle: string;
  plate: string;
  kind: VehicleKind;
  packageName: string;
  date: string;
  status: Status;
  inspector: string;
  mileage: string;
  year: string;
  items: InspectionItem[];
  returnNote?: string;
};

const plasticPaintOptions = ["正常","待检查", "拆装", "更换", "破损", "改装", "修复",  "自定义"];
const metalPaintOptions = ["正常","待检查", "拆装", "更换", "补漆", "钣金", "贴膜",  "自定义"];
const plasticPaintItems = new Set([
  "前保险杠",
  "右前大灯",
  "右前外后视镜",
  "右后尾灯",
  "后保险杠",
  "左后尾灯",
  "左前外后视镜",
  "左前大灯",
]);
const accidentDamageOptions = ["变形", "扭曲", "烧焊", "切割", "更换", "褶皱", "开裂"];
const majorAccidentDefaultOptions = [
  "正常",
  ...accidentDamageOptions,
];
const airbagOptions = ["正常", "更换", "召回更换", "缺失", "故障", "维修拆装", "受限不可检", "客户未同意拆检"];
const curtainAirbagOptions = ["正常", "未配备", ...airbagOptions.slice(1)];
const majorAccidentCriticalItems = new Set([
  "右前翼子板内骨架",
  "右前减振器座",
  "右前纵梁(上)",
  "不可拆水箱框架",
  "前围板",
  "左前纵梁（上）",
  "左前翼子板内骨架",
  "左前减振器座",
  "左A柱外侧",
  "左B柱内侧",
  "左底边梁内侧",
  "左C柱外侧",
  "左D柱内侧",
  "左后翼子板内骨架",
  "左后减振器座",
  "后围板",
  "右后减振器座",
  "右后翼子板内骨架",
  "右D柱内侧",
  "右C柱外侧",
  "右B柱内侧",
  "右A柱外侧",
  "车顶框架",
  "右底边梁内侧",
  "车体外缘左右对称",
  "车身底板（底盘）",
  "左后纵梁",
  "右后纵梁",
]);
const majorAccidentNonCriticalItems = new Set([
  "右前轮旋",
  "右前车灯框架",
  "可拆水箱框架",
  "左前车灯框架",
  "左前轮旋",
  "左A柱内侧",
  "左前侧气帘",
  "主驾驶气囊",
  "左底边梁外侧",
  "左C柱内侧",
  "左后侧气帘",
  "左D柱外侧",
  "左后轮旋",
  "左后灯框架",
  "左侧背箱流水槽",
  "后备箱底板",
  "右侧背箱流水槽",
  "右后灯框架",
  "右后轮旋",
  "右D柱外侧",
  "右C柱内侧",
  "右后侧气帘",
  "右A柱内侧",
  "右前侧气帘",
  "右底边梁外侧",
  "副驾驶气囊",
  "左前纵梁（下）",
  "右前纵梁（下）",
  "左底边梁内侧（下）",
  "右底边梁内侧（下）",
  "更换车身（车架）",
]);
const majorAccidentOptionsByItem: Record<string, string[]> = {
  "左前侧气帘": curtainAirbagOptions,
  "左后侧气帘": curtainAirbagOptions,
  "右后侧气帘": curtainAirbagOptions,
  "右前侧气帘": curtainAirbagOptions,
  "主驾驶气囊": airbagOptions,
  "副驾驶气囊": airbagOptions,
  "左D柱外侧": [...majorAccidentDefaultOptions, "未配备"],
  "右D柱外侧": [...majorAccidentDefaultOptions, "未配备"],
  "不可拆水箱框架": [...majorAccidentDefaultOptions, "未配备"],
  "左D柱内侧": [...majorAccidentDefaultOptions, "未配备"],
  "右D柱内侧": [...majorAccidentDefaultOptions, "未配备"],
  "车顶框架": [...majorAccidentDefaultOptions, "敞篷正常"],
  "车体外缘左右对称": ["正常", "异常"],
  "车身底板（底盘）": ["正常", "变形", "扭曲", "烧焊", "切割", "划伤", "褶皱", "开裂", "生锈"],
};
const nationalMajorAccidentNonCriticalItems = new Set([
  "可拆水箱框架",
  "左前车灯框架",
  "不可拆水箱框架",
  "右前车灯框架",
  "左前侧气帘",
  "主驾驶气囊",
  "左后侧气帘",
  "左侧背箱流水槽",
  "后围板",
  "后备箱底板",
  "右侧背箱流水槽",
  "右后侧气帘",
  "右前侧气帘",
  "副驾驶气囊",
  "车身底板（底盘）",
  "左底边梁内侧（下）",
  "右底边梁内侧（下）",
]);
const nationalMajorAccidentOptionsByItem: Record<string, string[]> = {
  "左前侧气帘": [...airbagOptions, "未配备"],
  "左后侧气帘": [...airbagOptions, "未配备"],
  "右后侧气帘": [...airbagOptions, "未配备"],
  "右前侧气帘": [...airbagOptions, "未配备"],
  "主驾驶气囊": airbagOptions,
  "副驾驶气囊": airbagOptions,
  "不可拆水箱框架": [...majorAccidentDefaultOptions, "未配备"],
  "左D柱": [...majorAccidentDefaultOptions, "未配备"],
  "右D柱": [...majorAccidentDefaultOptions, "未配备"],
  "车体外缘左右对称": ["正常", "异常"],
  "车身底板（底盘）": ["正常", "刮擦", "锈蚀", "焊接", "变形", "改装"],
};
const nationalMajorAccidentNames = [
  "可拆水箱框架",
  "左前纵梁",
  "左前车灯框架",
  "不可拆水箱框架",
  "前围板",
  "右前车灯框架",
  "右前纵梁",
  "左前减振器座",
  "左A柱",
  "左前侧气帘",
  "主驾驶气囊",
  "左B柱",
  "左底边梁内侧",
  "左底边梁外侧",
  "左C柱",
  "左后侧气帘",
  "左D柱",
  "左后减振器座",
  "左侧背箱流水槽",
  "后围板",
  "后备箱底板",
  "右侧背箱流水槽",
  "右后减振器座",
  "右D柱",
  "右C柱",
  "右后侧气帘",
  "右B柱",
  "右A柱",
  "右前侧气帘",
  "车顶框架",
  "右底边梁内侧",
  "右底边梁外侧",
  "副驾驶气囊",
  "车体外缘左右对称",
  "车身底板（底盘）",
  "左底边梁内侧（下）",
  "右底边梁内侧（下）",
  "左后纵梁",
  "右后纵梁",
];
const nationalMajorAccidentItems: InspectionItem[] = nationalMajorAccidentNames.map((name) => {
  const decisionType = nationalMajorAccidentNonCriticalItems.has(name) ? "非关键决定项" : "关键决定项";
  const options = nationalMajorAccidentOptionsByItem[name] ?? majorAccidentDefaultOptions;
  return {
    name,
    section: "重大事故检测",
    result: "待检查",
    options: ["待检查", ...options],
    decisionType,
    ...(decisionType === "关键决定项"
      ? { thresholdOptions: options.filter((option) => option !== "正常") }
      : {}),
  };
});
const waterDamageItems = new Set([
  "左前地毯",
  "主驾座椅骨架及滑轨",
  "行李箱底板",
  "副驾座椅骨架及滑轨",
  "右前地毯",
]);
const waterNotEquippedItems = new Set([
  "机舱保险丝盒",
  "驾驶室内保险丝盒",
  "主驾驶座椅线束",
  "左侧门槛线束",
  "点烟器底座",
  "行李箱保险丝盒及线束",
  "副驾驶座椅线束",
  "右侧门槛线束",
  "副驾线束及插头",
]);
const waterInspectionBaseOptions = ["正常", "拆装", "更换", "积水", "水渍泥沙", "脏污", "霉变", "故障", "锈蚀"];
const fireVehicleFindingOptions = ["烧蚀", "熏黑碳化", "炙烤融化"];
const fireNotEquippedItems = new Set(["机舱盖隔音棉", "后备箱线束/保险盒"]);
const fireInspectionBaseOptions = ["正常", "拆装", "更换", ...fireVehicleFindingOptions];
const glassNotEquippedItems = new Set([
  "左前角玻璃",
  "左后角玻璃",
  "右后角玻璃",
  "右前角玻璃",
  "天窗玻璃",
  "其他玻璃",
]);
const glassInspectionBaseOptions = ["正常", "碎裂", "裂痕", "更换"];
const interiorNotEquippedItems = new Set([
  "遮阳板/化妆镜",
  "中排座椅",
  "左D柱内饰板",
  "右D柱内饰板",
  "右C柱内饰板",
]);
const obdInspectionItems = [
  "气囊故障码",
  "车身稳定系统",
  "其他",
  "刹车系统故障码",
  "娱乐系统故障码",
];
const obdInspectionOptions = ["待检查", "无故障码", "有故障码"];
const mileageInspectionItems = [
  "机/电模块里程数据",
  "变速箱模块里程数据",
  "车身模块里程数据",
  "历史云端里程数据",
  "其他里程数据",
  "维保记录里程数据",
];
const mileageInspectionBaseOptions = ["数据正常", "异常数据"];
const mileageNoServiceItems = new Set(["历史云端里程数据", "其他里程数据", "维保记录里程数据"]);
const engineTransmissionInspectionItems: Array<{ name: string; options: string[] }> = [
  { name: "发动机机爪胶", options: ["正常", "老化", "更换", "破损", "自定义"] },
  { name: "发动机主体有无拆装", options: ["正常", "拆装", "更换", "破损", "渗漏"] },
  { name: "涡轮增压机", options: ["正常", "拆装", "更换", "破损", "渗漏"] },
  { name: "发动机有无渗漏油", options: ["正常", "渗油", "漏油"] },
  { name: "机油尺液位", options: ["正常", "高于", "低于机油标尺"] },
  { name: "水箱冷凝器", options: ["正常", "拆装", "更换", "渗漏"] },
  { name: "空调冷凝器", options: ["正常", "拆装", "更换", "渗漏"] },
  { name: "三元催化器", options: ["正常", "拆装", "未配备"] },
];
const chassisInspectionItems: Array<{ name: string; options: string[] }> = [
  { name: "左前刹车盘（刹车片）", options: ["正常", "破损", "建议更换", "改装", "变形"] },
  { name: "左前减震器", options: ["正常", "变形", "渗油", "改装"] },
  { name: "右前刹车盘（刹车片）", options: ["正常", "破损", "建议更换", "改装", "变形"] },
  { name: "右前减震器", options: ["正常", "变形", "渗油", "改装"] },
  { name: "左后刹车盘（刹车片）", options: ["正常", "破损", "建议更换", "改装", "变形"] },
  { name: "左后减震器", options: ["正常", "变形", "渗油", "改装"] },
  { name: "右后刹车盘（刹车片）", options: ["正常", "破损", "建议更换", "改装", "变形"] },
  { name: "右后减震器", options: ["正常", "变形", "渗油", "改装"] },
  { name: "备用轮胎", options: ["正常", "建议更换", "未配备"] },
  { name: "轮胎轮毂外侧", options: ["正常", "破损", "建议更换", "改装", "变形"] },
];
const newCarFunctionalInspectionItems: Array<{
  name: string;
  options: string[];
  customNoteResults?: string[];
  customNoteLabel?: string;
  customNotePrompt?: string;
}> = [
  {
    name: "款型年份核对",
    options: ["正常", "异常"],
    customNoteResults: ["异常"],
    customNoteLabel: "差异款型",
    customNotePrompt: "请填写差异款型",
  },
  { name: "展车/试驾车检测", options: ["正常", "库存", "试驾车"] },
  { name: "蓄电池检测", options: ["正常", "故障", "更换"] },
  { name: "机油量检测", options: ["正常", "低于警戒线", "建议更换", "高于最高线", "自定义"] },
  { name: "刹车油/冷却液检测", options: ["正常", "低于警戒线", "建议更换", "高于最高线", "自定义"] },
  { name: "空调功能", options: ["正常", "故障", "自定义"] },
  { name: "多媒体功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "主驾仪表检测", options: ["正常", "故障", "自定义"] },
  { name: "方向盘按键功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "主驾仪表台功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "主驾门板功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "主驾座椅功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "副仪表台功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "副驾座椅功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "副驾门板功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "车载USB接口", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "后排座椅功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "右后门板功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "左后门板功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "后尾门功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "后备箱功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "底盘升降功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "迎宾踏板功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "前照灯功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "主动格栅功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "电动电吸门功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "车内灯光功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "尾部灯光功能", options: ["正常", "故障", "自定义", "未配备"] },
  { name: "新车工具包", options: ["正常", "确失", "未配备"] },
];
const majorAccidentModules = [
  "漆面覆盖",
  "重大事故检测",
  "泡水检测",
  "火烧检测",
  "全车玻璃",
  "内饰检测",
  "OBD系统诊断",
  "车辆里程数读取",
  "发动机及变速箱检测",
  "底盘检查",
];
const templates: Template[] = [
  {
    id: "car-standard",
    name: "整车检测",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "整车检测",
    standardType: "国标",
    standard: "国家标准 · GB/T 30323-2013",
    description: "国标整车检测；重大事故模块采用国标清单，其余九个模块复用团标整车检测配置",
    sections: majorAccidentModules,
    itemCount: 160,
  },
  {
    id: "car-group",
    name: "整车检测",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "整车检测",
    standardType: "团标",
    standard: "行业团体标准 · 团标检",
    description: "团标整车检测；十个检测模块及 180 个检测项均已配置",
    sections: majorAccidentModules,
    itemCount: 180,
  },
  {
    id: "car-four",
    name: "四非排查",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "四非排查",
    standardType: "国标",
    standard: "国家标准 · 专项检测",
    description: "复用国标整车检测的漆面覆盖、重大事故、泡水、火烧和车辆里程数读取模块",
    sections: ["漆面覆盖", "重大事故检测", "泡水检测", "火烧检测", "车辆里程数读取"],
    itemCount: 101,
  },
  {
    id: "car-four-group",
    name: "四非排查",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "四非排查",
    standardType: "团标",
    standard: "行业团体标准 · 专项检测",
    description: "复用团标整车检测中的漆面覆盖、重大事故、泡水、火烧和车辆里程数读取模块",
    sections: ["漆面覆盖", "重大事故检测", "泡水检测", "火烧检测", "车辆里程数读取"],
    itemCount: 121,
  },
  {
    id: "car-three",
    name: "三非排查",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "三非排查",
    standardType: "国标",
    standard: "国家标准 · 专项检测",
    description: "复用国标整车检测的漆面覆盖、重大事故、泡水和火烧模块",
    sections: ["漆面覆盖", "重大事故检测", "泡水检测", "火烧检测"],
    itemCount: 95,
  },
  {
    id: "car-three-group",
    name: "三非排查",
    kind: "乘用车",
    vehicleType: "二手车",
    packageType: "三非排查",
    standardType: "团标",
    standard: "行业团体标准 · 专项检测",
    description: "复用团标整车检测中的漆面覆盖、重大事故、泡水和火烧模块",
    sections: ["漆面覆盖", "重大事故检测", "泡水检测", "火烧检测"],
    itemCount: 115,
  },
  {
    id: "car-new",
    name: "新车检测",
    kind: "乘用车",
    vehicleType: "新车",
    packageType: "新车检测",
    standardType: "国标",
    standard: "国家标准 · 新车检测",
    description: "复用国标整车检测六个模块，并复用团标新车车况功能性检测",
    sections: ["漆面覆盖", "重大事故检测", "全车玻璃", "内饰检测", "OBD系统诊断", "底盘检查", "车况功能性检测"],
    itemCount: 138,
  },
  {
    id: "car-new-group",
    name: "新车检测",
    kind: "乘用车",
    vehicleType: "新车",
    packageType: "新车检测",
    standardType: "团标",
    standard: "行业团体标准 · 新车检测",
    description: "复用团标整车检测六个模块，并配置车况功能性检测",
    sections: ["漆面覆盖", "重大事故检测", "全车玻璃", "内饰检测", "OBD系统诊断", "底盘检查", "车况功能性检测"],
    itemCount: 158,
  },
  {
    id: "car-energy",
    name: "新能源检测",
    kind: "乘用车",
    vehicleType: "新能源",
    packageType: "新能源检测",
    standardType: "国标",
    standard: "国家标准 · 新能源专项",
    description: "车辆交付与新能源系统专项检查；项目及判定规则按已审模板执行",
    sections: ["车辆信息", "高压安全", "动力电池", "电驱与充电", "车辆功能"],
    itemCount: 5,
  },
  {
    id: "car-energy-group",
    name: "新能源检测",
    kind: "乘用车",
    vehicleType: "新能源",
    packageType: "新能源检测",
    standardType: "团标",
    standard: "行业团体标准 · 新能源检测",
    description: "按机构团标执行新能源车辆专项检查和交付检查",
    sections: ["车辆信息", "高压安全", "动力电池", "电驱与充电", "车辆功能"],
    itemCount: 5,
  },
  {
    id: "moto-standard",
    name: "整车检测",
    kind: "摩托车",
    vehicleType: "二手车",
    standardType: "摩托车规范",
    standard: "摩托车二手车鉴定评估技术规范",
    description: "摩托车车况鉴定、主要部件检查与综合评估",
    sections: ["车辆信息", "车架与外观", "发动机与传动", "操控与制动", "电器与仪表"],
    itemCount: 6,
  },
  {
    id: "moto-group",
    name: "整车检测",
    kind: "摩托车",
    vehicleType: "二手车",
    standardType: "团标",
    standard: "行业团体标准 · 团标检",
    description: "机构自定义摩托车检测项、评分和报告展示",
    sections: ["车辆信息", "车体结构", "动力系统", "行驶系统", "电气系统"],
    itemCount: 8,
  },
];

const demoItems: InspectionItem[] = [
  { name: "车辆基本信息核验", section: "车辆信息", result: "正常" },
  { name: "右 A 柱外侧", section: "外观与结构", result: "喷漆", note: "漆面有修复痕迹" },
  { name: "左前翼子板", section: "外观与结构", result: "正常", photo: true },
  { name: "车辆涉水痕迹排查", section: "水泡排查", result: "正常" },
  { name: "发动机舱线束", section: "火烧排查", result: "正常" },
  { name: "车辆启动与仪表", section: "内饰与功能", result: "正常", photo: true },
];

const checklists: Record<string, InspectionItem[]> = {
  "car-standard": [],
  "car-group": [
    ...("前保险杠|前机盖|右前大灯|右前翼子板|右前外后视镜|右前车门|右后车门|右后翼子板|右后尾灯|后保险杠|后备箱盖|左后尾灯|左后翼子板|左后车门|左前车门|左前外后视镜|左前翼子板|左前大灯|车顶")
      .split("|")
      .map((name): InspectionItem => {
        const material = plasticPaintItems.has(name) ? "塑料件" : "金属件";
        return {
          name,
          section: "漆面覆盖",
          result: "待检查",
          material,
          options: material === "塑料件" ? plasticPaintOptions : metalPaintOptions,
        };
      }),
    ...("右前翼子板内骨架|右前轮旋|右前减振器座|右前车灯框架|右前纵梁(上)|可拆水箱框架|不可拆水箱框架|前围板|左前车灯框架|左前纵梁（上）|左前翼子板内骨架|左前减振器座|左前轮旋|左A柱外侧|左A柱内侧|左前侧气帘|主驾驶气囊|左B柱内侧|左底边梁内侧|左底边梁外侧|左C柱外侧|左C柱内侧|左后侧气帘|左D柱外侧|左后轮旋|左D柱内侧|左后翼子板内骨架|左后灯框架|左后减振器座|左侧背箱流水槽|后围板|后备箱底板|右侧背箱流水槽|右后灯框架|右后减振器座|右后翼子板内骨架|右D柱内侧|右后轮旋|右D柱外侧|右C柱外侧|右C柱内侧|右后侧气帘|右B柱内侧|右A柱外侧|右A柱内侧|右前侧气帘|车顶框架|右底边梁内侧|右底边梁外侧|副驾驶气囊|车体外缘左右对称|左前纵梁（下）|右前纵梁（下）|车身底板（底盘）|左底边梁内侧（下）|右底边梁内侧（下）|更换车身（车架）|左后纵梁|右后纵梁")
      .split("|")
      .map((name): InspectionItem => {
        if (!majorAccidentCriticalItems.has(name) && !majorAccidentNonCriticalItems.has(name)) {
          throw new Error(`重大事故检测项目未配置决定项类型：${name}`);
        }
        const decisionType = majorAccidentCriticalItems.has(name) ? "关键决定项" : "非关键决定项";
        const options = majorAccidentOptionsByItem[name] ?? majorAccidentDefaultOptions;
        return {
          name,
          section: "重大事故检测",
          result: "待检查",
          options: ["待检查", ...options],
          decisionType,
          ...(decisionType === "关键决定项"
            ? { thresholdOptions: options.filter((option) => option !== "正常") }
            : {}),
        };
      }),
    ...("机舱保险丝盒|左前地毯|左A柱夹层及周边|主驾线束及插头|驾驶室内保险丝盒|主驾座椅骨架及滑轨|主驾驶座椅线束|左侧门槛线束|转向柱及踏板支架|仪表台骨架|室内中央扶手区|点烟器底座|车内棚顶|左B柱夹层及周边|左B柱安全带及锁止机构|后排座椅骨架及海绵|左C柱夹层及周边|行李箱底板|行李箱保险丝盒及线束|右C柱夹层及周边|右B柱夹层及周边|右B柱安全带及锁止机构|副驾座椅骨架及滑轨|副驾驶座椅线束|右侧门槛线束|右前地毯|底板横梁空腔内部|右A柱夹层及周边|副驾线束及插头")
      .split("|")
      .map((name): InspectionItem => {
        const options = waterNotEquippedItems.has(name)
          ? [...waterInspectionBaseOptions, "未配备"]
          : [...waterInspectionBaseOptions, "自定义"];
        return {
          name,
          section: "泡水检测",
          result: "待检查",
          options: ["待检查", ...options],
          ...(waterDamageItems.has(name) ? { requiresWaterNote: true } : {}),
        };
      }),
    ...("防火墙隔音棉|机舱内管路|机舱内线束|机舱盖隔音棉|仪表台及附件|行李箱底板涂层|后备箱线束/保险盒|车身底板涂层")
      .split("|")
      .map((name): InspectionItem => ({
        name,
        section: "火烧检测",
        result: "待检查",
        options: [
          "待检查",
          ...fireInspectionBaseOptions,
          ...(fireNotEquippedItems.has(name) ? ["未配备"] : []),
        ],
      })),
    ...("前挡风玻璃|左前角玻璃|左前门玻璃|左后门玻璃|左后角玻璃|后挡风玻璃|右后角玻璃|右后门玻璃|右前门玻璃|右前角玻璃|天窗玻璃|其他玻璃")
      .split("|")
      .map((name): InspectionItem => ({
        name,
        section: "全车玻璃",
        result: "待检查",
        options: [
          "待检查",
          ...glassInspectionBaseOptions,
          ...(glassNotEquippedItems.has(name) ? ["未配备"] : []),
        ],
      })),
    ...("左前门内饰板|主驾座椅|方向盘|左A柱内饰板|仪表台|档杆部件|内后视镜|遮阳板/化妆镜|主驾驶安全带|左B柱内饰板|左后（中）门内饰板|中排座椅|后排座椅|左C柱内饰板|行李箱盖内饰板|右后（中）门内饰板|左D柱内饰板|右D柱内饰板|右C柱内饰板|副驾座椅|副驾驶安全带|右B柱内饰板|右前门内饰板|右A柱内饰板")
      .split("|")
      .map((name, index): InspectionItem => {
        const optionsByIndex = [
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "破损", "划伤", "更换", "缺失", "修复"],
          ["正常", "破损", "划伤", "更换", "缺失", "修复"],
          ["正常", "破损", "霉变", "更换", "缺失", "水渍", "改装"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "磨损", "划伤", "更换", "拆卸", "修复", "改装"],
          ["正常", "破损", "霉变", "更换", "缺失", "水渍", "改装"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
          ["正常", "破损", "划伤", "更换", "改装", "修复"],
        ][index];
        return {
          name,
          section: "内饰检测",
          result: "待检查",
          options: [
            "待检查",
            ...optionsByIndex,
            ...(interiorNotEquippedItems.has(name) ? ["未配备"] : []),
          ],
        };
      }),
    ...obdInspectionItems.map((name): InspectionItem => ({
      name,
      section: "OBD系统诊断",
      result: "待检查",
      options: obdInspectionOptions,
    })),
    ...mileageInspectionItems.map((name): InspectionItem => ({
      name,
      section: "车辆里程数读取",
      result: "待检查",
      options: [
        "待检查",
        ...mileageInspectionBaseOptions,
        ...(mileageNoServiceItems.has(name) ? ["此项检测无此服务"] : []),
      ],
    })),
    ...engineTransmissionInspectionItems.map(({ name, options }): InspectionItem => ({
      name,
      section: "发动机及变速箱检测",
      result: "待检查",
      options: ["待检查", ...options],
    })),
    ...chassisInspectionItems.map(({ name, options }): InspectionItem => ({
      name,
      section: "底盘检查",
      result: "待检查",
      options: ["待检查", ...options],
    })),
  ],
  "car-four": [],
  "car-four-group": [],
  "car-three": [],
  "car-three-group": [],
  "car-new": [],
  "car-new-group": [],
  "car-energy": [
    { name: "车辆身份与证照核验", section: "车辆信息", result: "正常" },
    { name: "高压部件外观与安全警示", section: "高压安全", result: "正常", photo: true },
    { name: "动力电池外观与固定状态", section: "动力电池", result: "正常", photo: true },
    { name: "电驱系统与充电功能", section: "电驱与充电", result: "正常" },
    { name: "车辆基础功能检查", section: "车辆功能", result: "正常" },
  ],
  "car-energy-group": [
    { name: "车辆身份与证照核验", section: "车辆信息", result: "正常" },
    { name: "高压系统外观与警示标识", section: "高压安全", result: "正常", photo: true },
    { name: "动力电池壳体与安装状态", section: "动力电池", result: "正常", photo: true },
    { name: "驱动与充电系统功能", section: "电驱与充电", result: "正常" },
    { name: "车辆基础功能检查", section: "车辆功能", result: "正常" },
  ],
  "moto-standard": [
    { name: "车辆身份与证照核验", section: "车辆信息", result: "正常" },
    { name: "车架与外观检查", section: "车架与外观", result: "正常", photo: true },
    { name: "发动机与传动检查", section: "发动机与传动", result: "正常" },
    { name: "转向与操控检查", section: "操控与制动", result: "正常" },
    { name: "制动系统检查", section: "操控与制动", result: "正常" },
    { name: "灯光与电器检查", section: "电器与仪表", result: "正常" },
  ],
  "moto-group": [
    { name: "车辆信息与登记资料", section: "车辆信息", result: "正常" },
    { name: "车架与焊接部位", section: "车体结构", result: "正常" },
    { name: "覆盖件与外观", section: "车体结构", result: "正常" },
    { name: "发动机运转状态", section: "动力系统", result: "正常" },
    { name: "传动系统与离合器", section: "动力系统", result: "正常" },
    { name: "车轮与悬架", section: "行驶系统", result: "正常" },
    { name: "制动与操控", section: "行驶系统", result: "正常" },
    { name: "灯光与电气装置", section: "电气系统", result: "正常" },
  ],
};

const copyChecklistSections = (sections: string[], templateId = "car-group") =>
  checklists[templateId]
    .filter((item) => sections.includes(item.section))
    .map((item) => ({
      ...item,
      options: item.options ? [...item.options] : undefined,
      thresholdOptions: item.thresholdOptions ? [...item.thresholdOptions] : undefined,
    }));

checklists["car-standard"] = majorAccidentModules.flatMap((section) =>
  section === "重大事故检测"
    ? nationalMajorAccidentItems.map((item) => ({
      ...item,
      options: item.options ? [...item.options] : undefined,
      thresholdOptions: item.thresholdOptions ? [...item.thresholdOptions] : undefined,
    }))
    : copyChecklistSections([section]),
);
checklists["car-three-group"] = copyChecklistSections([
  "漆面覆盖",
  "重大事故检测",
  "泡水检测",
  "火烧检测",
]);
checklists["car-four-group"] = copyChecklistSections([
  "漆面覆盖",
  "重大事故检测",
  "泡水检测",
  "火烧检测",
  "车辆里程数读取",
]);
checklists["car-three"] = copyChecklistSections([
  "漆面覆盖",
  "重大事故检测",
  "泡水检测",
  "火烧检测",
], "car-standard");
checklists["car-four"] = copyChecklistSections([
  "漆面覆盖",
  "重大事故检测",
  "泡水检测",
  "火烧检测",
  "车辆里程数读取",
], "car-standard");
checklists["car-new-group"] = [
  ...copyChecklistSections([
    "漆面覆盖",
    "重大事故检测",
    "全车玻璃",
    "内饰检测",
    "OBD系统诊断",
    "底盘检查",
  ]),
  ...newCarFunctionalInspectionItems.map((item): InspectionItem => ({
    ...item,
    section: "车况功能性检测",
    result: "待检查",
    options: ["待检查", ...item.options],
  })),
];
checklists["car-new"] = [
  ...copyChecklistSections([
    "漆面覆盖",
    "重大事故检测",
    "全车玻璃",
    "内饰检测",
    "OBD系统诊断",
    "底盘检查",
  ], "car-standard"),
  ...copyChecklistSections(["车况功能性检测"], "car-new-group"),
];

function checklistFor(templateId: string, initialResult = "待检查"): InspectionItem[] {
  return (checklists[templateId] ?? demoItems).map((item) => ({
    ...item,
    result: initialResult,
    photo: false,
    photoUrl: undefined,
  }));
}

const configuredProductionTemplateIds = [
  "car-three",
  "car-three-group",
  "car-four",
  "car-four-group",
  "car-standard",
  "car-group",
  "car-new",
  "car-new-group",
] as const;

const expectedConfiguredItemCounts: Record<(typeof configuredProductionTemplateIds)[number], number> = {
  "car-three": 95,
  "car-three-group": 115,
  "car-four": 101,
  "car-four-group": 121,
  "car-standard": 160,
  "car-group": 180,
  "car-new": 138,
  "car-new-group": 158,
};

const normalInspectionResults = new Set([
  "待检查",
  "正常",
  "敞篷正常",
  "数据正常",
  "无故障码",
  "此项检测无此服务",
  "未配备",
]);

export function buildConfiguredTemplateImport() {
  return configuredProductionTemplateIds.map((templateId) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    const checklist = checklists[templateId];
    if (!template || !checklist) {
      throw new Error(`已配置检测模板不存在：${templateId}`);
    }
    if (checklist.length !== expectedConfiguredItemCounts[templateId]) {
      throw new Error(`检测模板“${template.name}”项目数量与已配置清单不一致。`);
    }

    const sectionMap = new Map<string, {
      key: string;
      title: string;
      items: Array<{
        key: string;
        title: string;
        guidance?: string;
        options?: string[];
        required: boolean;
        evidenceRequiredWhen: string[];
        noteRequiredWhen: string[];
        thresholdRequiredWhen: string[];
      }>;
    }>();
    checklist.forEach((sourceItem, itemIndex) => {
      let section = sectionMap.get(sourceItem.section);
      if (!section) {
        section = {
          key: `section-${sectionMap.size + 1}`,
          title: sourceItem.section,
          items: [],
        };
        sectionMap.set(sourceItem.section, section);
      }
      const options = sourceItem.options ? [...new Set(sourceItem.options)] : undefined;
      const noteRequiredWhen = [
        ...(sourceItem.requiresWaterNote ? ["水渍泥沙"] : []),
        ...(options?.includes("自定义") ? ["自定义"] : []),
        ...(sourceItem.customNoteResults ?? []),
      ];
      const evidenceRequiredWhen = options?.filter((option) => !normalInspectionResults.has(option)) ?? [];
      const guidance = [
        sourceItem.material ? `检测材质：${sourceItem.material}` : "",
        sourceItem.customNotePrompt ?? "",
      ].filter(Boolean).join("；");
      section.items.push({
        key: `item-${String(itemIndex + 1).padStart(3, "0")}`,
        title: sourceItem.name,
        ...(guidance ? { guidance } : {}),
        ...(options ? { options } : {}),
        required: true,
        evidenceRequiredWhen,
        noteRequiredWhen: [...new Set(noteRequiredWhen)],
        thresholdRequiredWhen: sourceItem.thresholdOptions ? [...sourceItem.thresholdOptions] : [],
      });
    });

    return {
      code: template.id,
      title: template.name,
      vehicleKind: "PASSENGER_CAR" as const,
      usage: template.vehicleType === "新车" ? "NEW" as const : "USED" as const,
      standardType: template.standardType === "国标" ? "国标" as const : "团标" as const,
      schema: {
        version: 1 as const,
        sections: [...sectionMap.values()],
      },
    };
  });
}

function isInspectionItemComplete(item: InspectionItem) {
  return item.result !== "待检查"
    && !((item.result === "自定义" || item.customNoteResults?.includes(item.result)) && !item.customResult?.trim())
    && !(item.requiresWaterNote && item.result === "水渍泥沙" && !item.waterNote?.trim())
    && !(item.thresholdOptions?.includes(item.result) && !item.thresholdFinding);
}

function inspectionResultLabel(item: InspectionItem) {
  const result = item.result === "自定义" && item.customResult?.trim()
    ? `自定义：${item.customResult.trim()}`
    : item.customNoteResults?.includes(item.result) && item.customResult?.trim()
      ? `${item.result}（${item.customNoteLabel ?? "说明"}：${item.customResult.trim()}）`
      : item.result;
  const withWaterNote = item.requiresWaterNote && item.result === "水渍泥沙" && item.waterNote?.trim()
    ? `${result}（说明：${item.waterNote.trim()}）`
    : result;
  if (!item.thresholdOptions?.includes(item.result) || !item.thresholdFinding) return withWaterNote;
  return `${withWaterNote} · ${item.thresholdFinding}`;
}

function waterSiltFindingCount(items: InspectionItem[]) {
  return items.filter((item) => item.requiresWaterNote && item.result === "水渍泥沙").length;
}

function fireVehicleFindingCount(items: InspectionItem[]) {
  return items.filter((item) => item.section === "火烧检测" && fireVehicleFindingOptions.includes(item.result)).length;
}

function accidentVehicleFindingCount(items: InspectionItem[]) {
  return items.filter((item) =>
    item.decisionType === "关键决定项"
    && item.thresholdOptions?.includes(item.result)
    && item.thresholdFinding === "大于30cm×30cm").length;
}

function inspectionResultClass(item: InspectionItem) {
  if (item.result === "正常") return "result-select--good";
  if (item.result === "待检查") return "";
  if (item.decisionType === "关键决定项") {
    if (item.thresholdFinding === "大于30cm×30cm") return "result-select--critical-accident";
    if (item.thresholdFinding === "小于30cm×30cm") return "result-select--critical-caution";
    return "result-select--critical-pending";
  }
  return "result-select--issue";
}

function VehicleFindingAlert({ kind, detail, popupOffset = 0, triggerKey }: {
  kind: "water" | "fire" | "accident";
  detail: string;
  popupOffset?: number;
  triggerKey: number | string;
}) {
  const [isPopup, setIsPopup] = useState(true);

  useEffect(() => {
    setIsPopup(true);
    const timeout = window.setTimeout(() => setIsPopup(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [triggerKey]);

  const alertClass = kind === "water" ? "water-vehicle-alert" : kind === "fire" ? "fire-vehicle-alert" : "accident-vehicle-alert";
  const title = kind === "water" ? "泡水车提示" : kind === "fire" ? "火烧车提示" : "事故车提示";
  const className = `${alertClass}${isPopup ? " vehicle-alert--popup" : ""}`;
  return <div
    className={className}
    style={isPopup ? { "--vehicle-alert-offset": `${popupOffset}px` } as React.CSSProperties : undefined}
    role="status"
    aria-live="polite"
  >
    <Info size={18} />
    <div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  </div>;
}

const initialOrders: Order[] = [
  {
    id: "JJ20261024018",
    vehicle: "丰田 RAV4 荣放",
    plate: "苏 A·9B20Q",
    kind: "乘用车",
    templateId: "car-standard",
    packageName: "整车检测 · 国标",
    date: "今天 10:24",
    status: "待审核",
    inspector: "林师傅",
    mileage: "62,942 km",
    year: "2017 年",
    items: checklists["car-standard"].map((item) => ({
      ...item,
      result: item.decisionType ? "正常" : item.result,
    })),
  },
  {
    id: "JJ20261024017",
    vehicle: "本田 CB400",
    plate: "苏 B·6M82A",
    kind: "摩托车",
    templateId: "moto-standard",
    packageName: "整车检测 · 摩托车规范",
    date: "今天 09:16",
    status: "检测中",
    inspector: "林师傅",
    mileage: "18,320 km",
    year: "2021 年",
    items: checklists["moto-standard"].map((item) => ({ ...item })),
  },
  {
    id: "JJ20261023011",
    vehicle: "大众 途观 L",
    plate: "苏 A·31K86",
    kind: "乘用车",
    templateId: "car-four",
    packageName: "四非排查 · 国标",
    date: "昨天 16:40",
    status: "已完成",
    inspector: "林师傅",
    mileage: "45,800 km",
    year: "2020 年",
    items: checklists["car-four"].map((item, index) => ({ ...item, photo: index === 0 })),
  },
  {
    id: "JJ20261023009",
    vehicle: "宝马 3 系",
    plate: "苏 A·8X311",
    kind: "乘用车",
    templateId: "car-group",
    packageName: "整车检测 · 团标",
    date: "昨天 14:02",
    status: "待修改",
    inspector: "林师傅",
    mileage: "71,200 km",
    year: "2019 年",
    items: checklists["car-group"].map((item) => ({ ...item, result: "正常" })),
    returnNote: "请补充右前翼子板近照，并核验仪表里程照片。",
  },
];

const navItems: { key: Screen; label: string; icon: typeof CarFront }[] = [
  { key: "home", label: "工作台", icon: CarFront },
  { key: "orders", label: "检测订单", icon: ClipboardCheck },
  { key: "templates", label: "检测模板", icon: ListChecks },
  { key: "review", label: "审核中心", icon: FileCheck2 },
  { key: "profile", label: "我的", icon: UserRound },
];

function IconMark({ className = "" }: { className?: string }) {
  return (
    <div className={`brand-mark ${className}`} aria-hidden="true">
      <span className="brand-mark__dot" />
      <span className="brand-mark__line" />
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const tone: Record<Status, string> = {
    待检测: "neutral",
    检测中: "blue",
    待审核: "amber",
    待修改: "coral",
    已完成: "green",
  };
  return <span className={`status-pill status-pill--${tone[status]}`}><i />{status}</span>;
}

function VehicleIllustration({ kind = "乘用车", compact = false }: { kind?: VehicleKind; compact?: boolean }) {
  return (
    <div className={`vehicle-art ${kind === "摩托车" ? "vehicle-art--moto" : ""} ${compact ? "vehicle-art--compact" : ""}`}>
      <span className="vehicle-art__orb" />
      <span className="vehicle-art__road" />
      {kind === "摩托车" ? (
        <svg viewBox="0 0 320 180" role="img" aria-label="摩托车检测示意图">
          <circle cx="92" cy="127" r="29" /><circle cx="226" cy="127" r="29" />
          <path d="M92 127h45l31-47h43l15 47h-48l-24-31-30 30h-32l30-47h36m27 48 30-45 21 3m-88-22 12-10 23 1m-4-10h26l14 11" />
          <path d="m148 86-25-3-18 17m109-19 18-21 25 3" />
        </svg>
      ) : (
        <svg viewBox="0 0 340 180" role="img" aria-label="车辆检测示意图">
          <path d="m58 113 12-36c3-10 10-17 20-20l36-12h92l40 18 24 35 18 8v22h-23a23 23 0 0 0-46 0h-98a23 23 0 0 0-46 0H58z" />
          <path d="m95 60 33-10h75l30 14 17 26H84zm28 7h30v22h-42zm39 0h35v22h-35z" />
          <circle cx="116" cy="127" r="17" /><circle cx="252" cy="127" r="17" />
          <path d="M67 106h11m217 0h10M91 99h160" />
        </svg>
      )}
      {!compact && <span className="vehicle-art__caption">车辆示意图 · 实际照片由检测师上传</span>}
    </div>
  );
}

function getSharedOrder(slug: string): Order | null {
  const seeded = initialOrders.find((order) => order.id.toLowerCase() === slug);
  if (seeded?.status === "已完成") return seeded;

  try {
    const stored = window.localStorage.getItem(`jianjian:public-report:${slug}`);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      !("status" in parsed) ||
      !("items" in parsed) ||
      parsed.id !== slug.toUpperCase() ||
      parsed.status !== "已完成" ||
      !Array.isArray(parsed.items)
    ) return null;
    return parsed as Order;
  } catch (error) {
    console.error("无法读取分享的检测报告。", error);
    return null;
  }
}

function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取照片失败，请重新选择。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法解析所选照片，请更换图片后重试。"));
      image.onload = () => {
        const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("当前设备无法处理照片，请稍后重试。"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const publicSlug = window.location.pathname.match(/^\/r\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase() ?? "";
  const isPublicReport = Boolean(publicSlug);
  const [sharedOrder] = useState<Order | null>(() => publicSlug ? getSharedOrder(publicSlug) : null);
  const [screen, setScreen] = useState<Screen>(isPublicReport ? "report" : "home");
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [activeOrderId, setActiveOrderId] = useState(sharedOrder?.id ?? initialOrders[0].id);
  const [selectedKind, setSelectedKind] = useState<VehicleKind>("乘用车");
  const [vehicleType, setVehicleType] = useState("二手车");
  const [selectedTemplateId, setSelectedTemplateId] = useState("car-standard");
  const [passengerStandard, setPassengerStandard] = useState<PassengerStandard>("国标");
  const [passengerCreateStep, setPassengerCreateStep] = useState<"standard" | "package" | null>(null);
  const [currentRole, setCurrentRole] = useState<OrganizationRole>("检测师");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [orderFilter, setOrderFilter] = useState("全部");
  const [templateKind, setTemplateKind] = useState<VehicleKind>("乘用车");
  const [activeSection, setActiveSection] = useState("漆面覆盖");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [toast, setToast] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const activeOrder = isPublicReport ? sharedOrder : orders.find((order) => order.id === activeOrderId) ?? orders[0];

  const activeTemplate = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const filteredOrders = useMemo(
    () => orders.filter((order) => orderFilter === "全部" || order.status === orderFilter),
    [orders, orderFilter],
  );
  const reviewOrders = orders.filter((order) => order.status === "待审核");

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function navigate(next: Screen, selectedOrderId?: string) {
    setScreen(next);
    if (selectedOrderId) setActiveOrderId(selectedOrderId);
    else if (next === "review" && !orders.some((order) => order.id === activeOrderId && order.status === "待审核")) {
      const firstPendingReview = orders.find((order) => order.status === "待审核");
      if (firstPendingReview) setActiveOrderId(firstPendingReview.id);
    }
    if (next === "inspect") {
      const targetOrder = orders.find((order) => order.id === (selectedOrderId ?? activeOrderId));
      const targetTemplate = templates.find((template) => template.id === targetOrder?.templateId);
      setActiveSection(targetTemplate?.sections[0] ?? "");
    }
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startCreate(kind: VehicleKind = selectedKind, type = "二手车") {
    setSelectedKind(kind);
    setVehicleType(type);
    setPassengerCreateStep(kind === "乘用车" ? "standard" : null);
    if (kind === "乘用车") setPassengerStandard("国标");
    const first = templates.find((item) => item.kind === kind && (kind === "摩托车" || item.vehicleType === type));
    if (first) setSelectedTemplateId(first.id);
    if (kind === "乘用车") {
      setCreateOpen(false);
      navigate("create");
    } else {
      setCreateOpen(true);
    }
  }

  function choosePassengerPackage(packageType: PassengerPackageType) {
    if (packageType === "新能源检测") {
      notify("正在建设中，敬请期待");
      return;
    }
    const template = templates.find((item) =>
      item.kind === "乘用车" && item.standardType === passengerStandard && item.packageType === packageType,
    );
    if (!template) {
      notify(`当前暂无${passengerStandard}${packageType}模板，请联系机构管理员配置`);
      return;
    }
    setSelectedTemplateId(template.id);
    setVehicleType(template.vehicleType);
    createOrder(template, "乘用车");
  }

  function createOrder(templateOverride?: Template, kindOverride?: VehicleKind) {
    const orderTemplate = templateOverride ?? activeTemplate;
    const orderKind = kindOverride ?? selectedKind;
    if (orderTemplate.kind === "乘用车" && orderTemplate.packageType === "新能源检测") {
      notify("正在建设中，敬请期待");
      return;
    }
    const id = `JJ${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${String(orders.length + 20).padStart(3, "0")}`;
    const next: Order = {
      id,
      templateId: orderTemplate.id,
      vehicle: orderKind === "乘用车" ? "待录入车辆信息" : "待录入摩托车信息",
      plate: "待填写车牌",
      kind: orderKind,
      packageName: `${orderTemplate.name} · ${orderTemplate.standardType}`,
      date: "刚刚创建",
      status: "检测中",
      inspector: "林师傅",
      mileage: "待填写",
      year: "待填写",
      items: checklistFor(orderTemplate.id),
    };
    setOrders((current) => [next, ...current]);
    setActiveOrderId(id);
    setActiveSection(orderTemplate.sections[0] ?? "");
    setCreateOpen(false);
    setScreen("inspect");
  }

  function changeItemResult(index: number, result?: string) {
    const cycleOptions = ["正常", "喷漆", "更换", "变形", "锈蚀", "待检查"];
    setOrders((current) => current.map((order) => order.id !== activeOrderId ? order : {
      ...order,
      items: order.items.map((item, i) => i !== index ? item : {
        ...item,
        result: result ?? cycleOptions[(cycleOptions.indexOf(item.result) + 1) % cycleOptions.length],
        customResult: result === "自定义" ? item.customResult : undefined,
        waterNote: result === "水渍泥沙" ? item.waterNote : undefined,
        thresholdFinding: undefined,
      }),
    }));
  }

  function changeItemCustomResult(index: number, customResult: string) {
    setOrders((current) => current.map((order) => order.id !== activeOrderId ? order : {
      ...order,
      items: order.items.map((item, itemIndex) => itemIndex !== index ? item : { ...item, customResult }),
    }));
  }

  function changeItemWaterNote(index: number, waterNote: string) {
    setOrders((current) => current.map((order) => order.id !== activeOrderId ? order : {
      ...order,
      items: order.items.map((item, itemIndex) => itemIndex !== index ? item : { ...item, waterNote }),
    }));
  }

  function changeItemThreshold(index: number, thresholdFinding: InspectionItem["thresholdFinding"]) {
    setOrders((current) => current.map((order) => order.id !== activeOrderId ? order : {
      ...order,
      items: order.items.map((item, itemIndex) => itemIndex !== index ? item : { ...item, thresholdFinding }),
    }));
  }

  async function addItemPhoto(index: number, file: File) {
    if (!file.type.startsWith("image/")) {
      notify("请选择图片文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notify("单张照片不能超过 20 MB");
      return;
    }
    try {
      const photoUrl = await resizePhoto(file);
      setOrders((current) => current.map((order) => order.id !== activeOrderId ? order : {
        ...order,
        items: order.items.map((item, itemIndex) => itemIndex !== index ? item : { ...item, photo: true, photoUrl }),
      }));
      notify("现场照片已添加，压缩后用于报告展示");
    } catch (error) {
      console.error("处理现场照片失败。", error);
      notify(error instanceof Error ? error.message : "照片处理失败，请重试");
    }
  }

  function submitForReview() {
    const inspectionTemplate = templates.find((item) => item.id === activeOrder?.templateId);
    if (inspectionTemplate?.pendingSections?.length) {
      notify(`当前模板还有 ${inspectionTemplate.pendingSections.length} 个检测模块待配置，暂不能提交审核`);
      return;
    }
    const pending = activeOrder?.items.filter((item) => !isInspectionItemComplete(item)).length ?? 0;
    if (pending > 0) {
      notify(`还有 ${pending} 个检测项未完成，包括需要补充的尺寸判定`);
      return;
    }
    const missingEvidence = activeOrder?.items.filter((item) => !["正常", "待检查"].includes(item.result) && !item.photo).length ?? 0;
    if (missingEvidence > 0) {
      notify(`还有 ${missingEvidence} 个异常项未添加现场照片`);
      return;
    }
    setOrders((current) => current.map((order) => order.id === activeOrderId ? { ...order, status: "待审核" } : order));
    setScreen("review");
    notify("检测内容已锁定并提交审核");
  }

  function approveOrder(id: string) {
    if (currentRole !== "机构管理员") {
      notify("仅机构管理员可以审核并发布检测报告");
      return;
    }
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status: "已完成" } : order));
    setActiveOrderId(id);
    navigate("report");
    notify("审核通过，正式报告已发布");
  }

  function returnOrder() {
    if (currentRole !== "机构管理员") {
      notify("仅机构管理员可以退回检测报告");
      return;
    }
    if (!returnNote.trim()) return;
    setOrders((current) => current.map((order) => order.id === activeOrderId ? { ...order, status: "待修改", returnNote: returnNote.trim() } : order));
    setShowReturnDialog(false);
    setReturnNote("");
    navigate("orders");
    notify("已退回检测师修改，修改意见已记录");
  }

  function saveInspection() {
    setOrders((current) => current.map((order) => order.id === activeOrderId ? { ...order, status: "检测中" } : order));
    notify("检测草稿已保存");
  }

  async function copyReportLink() {
    if (!activeOrder || activeOrder.status !== "已完成") {
      notify("仅审核通过并发布的报告可以分享");
      return;
    }
    const slug = activeOrder.id.toLowerCase();
    const shareUrl = `${window.location.origin}/r/${slug}`;
    try {
      window.localStorage.setItem(`jianjian:public-report:${slug}`, JSON.stringify(activeOrder));
    } catch (error) {
      console.error("保存本地演示报告失败。", error);
      notify("无法生成分享链接，请检查浏览器存储设置");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify("报告链接已复制");
    } catch (error) {
      console.error("复制报告链接失败。", error);
      notify("公开报告链接已生成，请在分享窗口中手动复制");
    }
  }

  const templateOptions = templates.filter((item) =>
    item.kind === selectedKind && (selectedKind === "乘用车"
      ? item.vehicleType === vehicleType
      : item.vehicleType === vehicleType),
  );

  return (
    <div className="app-shell">
      {!isPublicReport && <aside className={`sidebar ${mobileMenu ? "sidebar--open" : ""}`}>
        <button className="brand-lockup" onClick={() => navigate("home")} aria-label="返回工作台">
          <IconMark />
          <span><strong>鉴见</strong><small>INSPECTION STUDIO</small></span>
        </button>
        <div className="tenant-switch">
          <div className="tenant-avatar">远</div>
          <div><strong>远行车辆检测</strong><small>机构工作空间</small></div>
          <ChevronDown size={16} />
        </div>
        <div className="sidebar-label">工作空间</div>
        <nav className="side-nav">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`side-nav__item ${screen === key ? "is-active" : ""}`} onClick={() => navigate(key)}>
              <Icon size={18} strokeWidth={1.8} /><span>{key === "review" && currentRole === "检测师" ? "审核进度" : label}</span>
              {key === "review" && reviewOrders.length > 0 && <b>{reviewOrders.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-card__icon"><Sparkles size={16} /></div>
            <strong>让专业，变得简单</strong>
            <span>机构专属检测工作台</span>
            <button onClick={() => notify("已联系机构管理员")}>了解机构服务 <ArrowUpRight size={14} /></button>
          </div>
          <button className="user-switch" onClick={() => navigate("profile")}>
            <div className="avatar">{currentRole === "检测师" ? "林" : "周"}</div><span><strong>{currentRole === "检测师" ? "林师傅" : "周经理"}</strong><small>{currentRole} · 远行机构</small></span><MoreHorizontal size={17} />
          </button>
        </div>
      </aside>}

      <main className={`main-area ${isPublicReport ? "main-area--public" : ""}`}>
        {!isPublicReport ? <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobileMenu((open) => !open)} aria-label="切换菜单"><SlidersHorizontal size={19} /></button>
          <div className="breadcrumb"><span>远行车辆检测</span><ChevronRight size={15} /><strong>{screen === "review" && currentRole === "检测师" ? "审核进度" : navItems.find((item) => item.key === screen)?.label ?? (screen === "create" ? "创建检测订单" : screen === "inspect" ? "现场检测" : screen === "report" ? "检测报告" : "工作台")}</strong></div>
          <div className="topbar-right">
            <span className="connection-dot" /><small>服务正常</small>
            <button className="topbar-help" onClick={() => notify("帮助中心即将开放")}><CircleHelp size={17} /><span>帮助</span></button>
            <button className="avatar avatar--small" onClick={() => navigate("profile")}>{currentRole === "检测师" ? "林" : "周"}</button>
          </div>
        </header> : <header className="public-report-header"><IconMark /><span><strong>鉴见</strong><small>远行车辆检测 · 正式报告只读分享</small></span><ShieldCheck size={17} /></header>}

        <div className={`page-content ${isPublicReport ? "page-content--public" : ""} ${screen === "create" ? "page-content--create" : ""}`}>
          {screen === "create" && (
            <PassengerOrderCreateScreen
              step={passengerCreateStep ?? "standard"}
              standard={passengerStandard}
              onBack={() => {
                if (passengerCreateStep === "package") setPassengerCreateStep("standard");
                else navigate("home");
              }}
              onCancel={() => navigate("home")}
              onChooseStandard={(standard) => {
                setPassengerStandard(standard);
                setPassengerCreateStep("package");
              }}
              onChoosePackage={choosePassengerPackage}
            />
          )}
          {screen === "home" && (
            <HomeScreen
              orders={orders}
              reviewCount={reviewOrders.length}
              searchValue={searchValue}
              searchMessage={searchMessage}
              onSearchChange={setSearchValue}
              onSearch={() => {
                if (!searchValue.trim()) setSearchMessage("请输入车架号或车牌号");
                else setSearchMessage("已预留第三方车辆信息查询接口，接入后即可核验车辆档案");
              }}
              onNavigate={navigate}
              onSelectOrder={(order) => navigate(order.status === "待审核" ? "review" : order.status === "已完成" ? "report" : "inspect", order.id)}
              onFilterTemplates={() => { setTemplateKind("乘用车"); navigate("templates"); }}
              onStartVehicleType={(type) => startCreate("乘用车", type)}
            />
          )}
          {screen === "orders" && (
            <OrdersScreen
              orders={filteredOrders}
              filter={orderFilter}
              setFilter={setOrderFilter}
              onNewOrder={() => startCreate()}
              onSelect={(order) => navigate(order.status === "已完成" ? "report" : order.status === "待审核" ? "review" : "inspect", order.id)}
            />
          )}
          {screen === "templates" && (
            <TemplatesScreen
              kind={templateKind}
              setKind={setTemplateKind}
              onCreate={(template) => {
                setSelectedKind(template.kind);
                setVehicleType(template.vehicleType);
                setSelectedTemplateId(template.id);
                setPassengerStandard(template.standardType === "团标" ? "团标" : "国标");
                setPassengerCreateStep(null);
                setCreateOpen(true);
              }}
            />
          )}
          {screen === "inspect" && activeOrder && (
            <InspectScreen
              order={activeOrder}
              section={activeSection}
              setSection={setActiveSection}
              onResult={changeItemResult}
              onCustomResult={changeItemCustomResult}
              onWaterNote={changeItemWaterNote}
              onThreshold={changeItemThreshold}
              onPhoto={addItemPhoto}
              onBack={() => navigate("orders")}
              onSave={saveInspection}
              onSubmit={submitForReview}
              onNotify={notify}
            />
          )}
          {screen === "review" && (
            currentRole === "机构管理员"
              ? <ReviewScreen
                  orders={reviewOrders}
                  activeOrder={activeOrder ?? orders[0]}
                  onSelect={(order) => setActiveOrderId(order.id)}
                  onApprove={() => approveOrder(activeOrderId)}
                  onReturn={() => setShowReturnDialog(true)}
                  onOpenOrders={() => navigate("orders")}
                  onNotify={notify}
                />
              : <ReviewProgressScreen orders={orders} onSelect={(order) => {
                  if (order.status === "已完成") navigate("report", order.id);
                  else navigate("orders", order.id);
                }} />
          )}
          {screen === "profile" && <ProfileScreen
            orders={orders}
            currentRole={currentRole}
            onRoleChange={setCurrentRole}
            onNavigate={navigate}
            onSelectOrder={(order) => {
              navigate(order.status === "已完成" ? "report" : "orders", order.id);
            }}
            onOpenHistory={() => {
              const latestReport = orders.find((order) => order.status === "已完成");
              if (!latestReport) {
                notify("暂无已发布的正式报告");
                return;
              }
              navigate("report", latestReport.id);
            }}
          />}
          {screen === "report" && activeOrder && <ReportScreen order={activeOrder} onShare={() => setShowShare(true)} onBack={() => navigate("orders")} isPublic={isPublicReport} />}
          {screen === "report" && !activeOrder && isPublicReport && <div className="public-report-missing"><ShieldCheck size={27} /><h1>报告暂不可用</h1><p>分享链接无效、已过期，或报告已被机构撤销。</p></div>}
        </div>
        {!isPublicReport && <footer className="app-footer"><span>© 2026 鉴见 · 车辆检测工作台</span><span>检测记录留痕 · 报告版本可追溯</span></footer>}
      </main>

      {!isPublicReport && <nav className="mobile-nav">
        {[
          { key: "home" as Screen, label: "首页", icon: CarFront },
          { key: "orders" as Screen, label: "订单", icon: ClipboardCheck },
          { key: "review" as Screen, label: currentRole === "机构管理员" ? "审核" : "进度", icon: FileCheck2 },
          { key: "profile" as Screen, label: "我的", icon: UserRound },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} className={screen === key ? "is-active" : ""} onClick={() => navigate(key)}>
            <span><Icon size={19} />{key === "review" && reviewOrders.length > 0 && <i />}</span>{label}
          </button>
        ))}
      </nav>}

      {createOpen && (
        <div className={`modal-backdrop ${passengerCreateStep ? "modal-backdrop--centered" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section className="modal-card create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-heading">
              <div><span className="eyebrow">新建检测任务</span><h2 id="create-title">创建检测订单</h2></div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="关闭"><X size={20} /></button>
            </div>
            <p className="modal-intro">{passengerCreateStep
              ? "先选择适用标准，再选择检测业务类型。创建后将按对应模板进入现场检测。"
              : "先选择车辆类型和检测方案，稍后可补充委托人及车辆资料。"}
            </p>
            
            {/* --- 步骤 1：选择检测标准 --- */}
            {passengerCreateStep === "standard" && (
              <>
                <div className="field-label">选择检测标准</div>
                <div className="passenger-standard-options">
                  {(["国标", "团标"] as PassengerStandard[]).map((standard) => (
                    <button 
                      key={standard} 
                      className={`passenger-standard-option passenger-standard-option--${standard === "国标" ? "national" : "group"}`} 
                      onClick={() => {
                        setPassengerStandard(standard);
                        setPassengerCreateStep("package");
                      }}
                    >
                      <div className="passenger-standard-option__content">
                        <strong>{standard === "国标" ? "按国家标准配置的检测模板" : "按团体标准配置的检测模板"}</strong>
                      </div>
                      <ChevronRight size={18} className="passenger-standard-option__icon" />
                    </button>
                  ))}
                </div>
              </>
            )}
      
            {/* --- 步骤 2：选择检测类型 --- */}
            {passengerCreateStep === "package" && (
              <>
                <div className="passenger-step-heading">
                  <button className="back-link" onClick={() => setPassengerCreateStep("standard")}>
                    <ArrowLeft size={15} /> 更换标准
                  </button>
                  <span>当前标准：<strong>{passengerStandard}</strong></span>
                </div>
                <div className="field-label">选择检测类型</div>
                <div className="passenger-package-grid">
                  {(["三非排查", "四非排查", "整车检测", "新车检测", "新能源检测"] as PassengerPackageType[]).map((packageType, index) => {
                    const template = templates.find((item) => item.kind === "乘用车" && item.standardType === passengerStandard && item.packageType === packageType);
                    const isComingSoon = packageType === "新能源检测";
                    return (
                      <button key={packageType} className={`passenger-package-card ${isComingSoon ? "is-coming-soon" : ""}`} onClick={() => choosePassengerPackage(packageType)} aria-label={isComingSoon ? `${packageType}，正在建设中，敬请期待` : packageType}>
                        <div className="passenger-package-card__header">
                          <span className="passenger-package-card__index">0{index + 1}</span>
                          <strong>{packageType}</strong>
                        </div>
                        <small>{isComingSoon ? "正在建设中，敬请期待" : template ? `${template.itemCount} 个检测项 · ${template.sections.length} 个章节` : "该标准模板暂未配置"}</small>
                        <div className="passenger-package-card__footer">
                          {isComingSoon ? "正在建设中，敬请期待" : template ? "选择此检测类型" : "暂不可用"} {!isComingSoon && <ArrowRight size={14} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
      
            {/* --- 初始状态：选择车辆和套餐 --- */}
            {!passengerCreateStep && (
              <>
                <div className="field-label">检测对象</div>
                <div className="modal-create-choice-row">
                  {(["乘用车", "摩托车"] as VehicleKind[]).map((kind) => (
                    <button key={kind} className={`modal-vehicle-choice ${selectedKind === kind ? "is-selected" : ""}`} onClick={() => {
                      setSelectedKind(kind);
                      if (kind === "摩托车") setVehicleType("二手车");
                      const first = templates.find((item) => item.kind === kind && (kind === "摩托车" || vehicleType !== "新车" || item.vehicleType === "新车"));
                      if (first) setSelectedTemplateId(first.id);
                    }}>
                      {kind === "乘用车" ? <CarFront size={20} /> : <Bike size={20} />}
                      <span className="modal-vehicle-choice__content"><strong>{kind}</strong><small>{kind === "乘用车" ? "新车 · 二手车" : "摩托车 · 二手车"}</small></span>
                      {selectedKind === kind && <Check size={17} />}
                    </button>
                  ))}
                </div>
                
                {selectedKind === "乘用车" && (
                  <div className="modal-segmented-control">
                    {["新车", "二手车"].map((type) => (
                      <button key={type} className={vehicleType === type ? "is-active" : ""} onClick={() => {
                        setVehicleType(type);
                        const first = templates.find((item) => item.kind === selectedKind && item.vehicleType === type);
                        if (first) setSelectedTemplateId(first.id);
                      }}>{type}</button>
                    ))}
                  </div>
                )}
      
                <div className="field-label field-label--spaced">检测套餐 <span>套餐决定本次报告检测项</span></div>
                <div className="modal-package-options">
                  {templateOptions.map((template) => (
                    <button key={template.id} className={`modal-package-option ${selectedTemplateId === template.id ? "is-selected" : ""} ${template.packageType === "新能源检测" ? "is-coming-soon" : ""}`} onClick={() => {
                      if (template.packageType === "新能源检测") {
                        notify("正在建设中，敬请期待");
                        return;
                      }
                      setSelectedTemplateId(template.id);
                    }}>
                      <span className="modal-package-option__check">{selectedTemplateId === template.id && <Check size={13} />}</span>
                      <span className="modal-package-option__content">
                        <strong>{template.name} <i>{template.standardType}</i></strong>
                        <small>{template.packageType === "新能源检测" ? "正在建设中，敬请期待" : template.description}</small>
                        {template.packageType !== "新能源检测" && <small className="modal-package-option__count">{template.itemCount} 个检测项 · {template.sections.length} 个章节</small>}
                      </span>
                      {template.packageType !== "新能源检测" && <ChevronRight size={17} />}
                    </button>
                  ))}
                </div>
              </>
            )}
      
            <div className="modal-actions">
              <button className="button button--secondary" onClick={() => setCreateOpen(false)}>取消</button>
              <button 
                className="button button--primary" 
                disabled={passengerCreateStep !== null} 
                onClick={() => createOrder()}
              >
                创建订单并开始检测 <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}

      {showReturnDialog && currentRole === "机构管理员" && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowReturnDialog(false); }}>
          <section className="modal-card return-modal" role="dialog" aria-modal="true" aria-labelledby="return-title">
            <div className="modal-heading"><div><span className="eyebrow">审核操作</span><h2 id="return-title">退回修改</h2></div><button className="icon-button" onClick={() => setShowReturnDialog(false)} aria-label="关闭"><X size={20} /></button></div>
            <p className="modal-intro">请具体说明需要修改的检测项目或照片，提交后检测师可按意见重新编辑并送审。</p>
            <label className="field-label" htmlFor="return-note">修改意见 <span>必填</span></label>
            <textarea id="return-note" className="text-area" rows={4} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="例如：请补充右前翼子板近照，并核验仪表里程照片。" />
            <div className="modal-actions"><button className="button button--secondary" onClick={() => setShowReturnDialog(false)}>取消</button><button className="button button--coral" disabled={!returnNote.trim()} onClick={returnOrder}>确认退回修改</button></div>
          </section>
        </div>
      )}

      {showShare && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowShare(false); }}>
          <section className="modal-card share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <div className="modal-heading"><div><span className="eyebrow">公开报告链接</span><h2 id="share-title">分享给委托人</h2></div><button className="icon-button" onClick={() => setShowShare(false)} aria-label="关闭"><X size={20} /></button></div>
            <div className="share-preview"><div className="share-preview__icon"><FileCheck2 size={22} /></div><div><strong>{activeOrder?.vehicle ?? "车辆检测报告"}</strong><span>正式报告 · 只读访问</span></div><ShieldCheck size={19} /></div>
            <div className="share-link"><span>{window.location.host}/r/{activeOrder?.id.toLowerCase()}</span><button onClick={() => {
              void copyReportLink();
            }}><Link2 size={15} />复制链接</button></div>
            <div className="share-note"><Info size={15} /><span>委托人无需注册或登录即可查看报告与检测照片。生产环境需为公开链接配置有效期、访问撤销和敏感信息脱敏。</span></div>
          </section>
        </div>
      )}

      {toast && <div className="toast"><CheckCheck size={17} />{toast}</div>}
    </div>
  );
}

function PassengerOrderCreateScreen({
  step,
  standard,
  onBack,
  onCancel,
  onChooseStandard,
  onChoosePackage,
}: {
  step: "standard" | "package";
  standard: PassengerStandard;
  onBack: () => void;
  onCancel: () => void;
  onChooseStandard: (standard: PassengerStandard) => void;
  onChoosePackage: (packageType: PassengerPackageType) => void;
}) {
  const packageTypes: PassengerPackageType[] = ["三非排查", "四非排查", "整车检测", "新车检测", "新能源检测"];
  const currentStep = step === "standard" ? 1 : 2;

  return <>
    <header className="passenger-create-heading">
      <div><span className="eyebrow">NEW INSPECTION</span><h1>创建检测订单</h1><p>乘用车检测 · 按所选标准与业务类型匹配检测模板</p></div>
      <button className="button button--secondary" onClick={onCancel}><X size={15} /> 取消创建</button>
    </header>
    <section className="passenger-create-page">
      <header className="passenger-create-hero">
        <div className="passenger-create-hero__copy">
          <span className="passenger-create-hero__eyebrow">PASSENGER VEHICLE</span>
          <h2>为每一次判断，选择合适的依据</h2>
          <p>选择检测标准和业务类型后，将按对应模板创建检测任务。</p>
        </div>
        <div className="passenger-create-hero__mark"><CarFront size={37} strokeWidth={1.5} /></div>
      </header>

      <div className="passenger-create-progress" aria-label={`创建步骤 ${currentStep} / 2`}>
        {[
          { number: 1, label: "选择标准" },
          { number: 2, label: "检测类型" },
        ].map((item, index) => (
          <div className={`passenger-create-progress__step ${currentStep >= item.number ? "is-active" : ""}`} key={item.number}>
            <span>{currentStep > item.number ? <Check size={14} /> : item.number}</span>
            <strong>{item.label}</strong>
            {index < 1 && <i />}
          </div>
        ))}
      </div>

      <section className="passenger-create-panel">
        {step === "standard" && <>
          <div className="passenger-create-panel__heading">
            <span className="passenger-create-panel__kicker">STEP 01 · STANDARD</span>
            <h2>选择检测标准</h2>
            <p>请选择本次检测所依据的标准类型</p>
          </div>
          <div className="passenger-standard-options passenger-standard-options--page">
            {(["国标", "团标"] as PassengerStandard[]).map((value) => (
              <button
                key={value}
                className={`passenger-standard-option passenger-standard-option--${value === "国标" ? "national" : "group"}`}
                onClick={() => onChooseStandard(value)}
              >
                <span className="passenger-standard-option__badge">{value}</span>
                <span className="passenger-standard-option__content">
                  <strong>按{value === "国标" ? "国家" : "团体"}标准配置的检测模板</strong>
                </span>
                <span className="passenger-standard-option__arrow"><ChevronRight size={20} /></span>
              </button>
            ))}
          </div>
        </>}

        {step === "package" && <>
          <div className="passenger-create-panel__topline">
            <button className="passenger-create-back" onClick={onBack}><ArrowLeft size={16} /> 返回选择标准</button>
            <span className={`passenger-standard-chip passenger-standard-chip--${standard === "国标" ? "national" : "group"}`}>{standard}标准</span>
          </div>
          <div className="passenger-create-panel__heading">
            <span className="passenger-create-panel__kicker">STEP 02 · INSPECTION TYPE</span>
            <h2>选择检测类型</h2>
            <p>以下检测类型均按{standard}标准匹配对应模板</p>
          </div>
          <div className="passenger-package-grid passenger-package-grid--page">
            {packageTypes.map((type, index) => {
              const matchedTemplate = templates.find((item) =>
                item.kind === "乘用车" && item.standardType === standard && item.packageType === type,
              );
              const isComingSoon = type === "新能源检测";
              return <button
                key={type}
                className={`passenger-package-card passenger-package-card--page ${!matchedTemplate || isComingSoon ? "is-unavailable" : ""} ${isComingSoon ? "is-coming-soon" : ""}`}
                disabled={!matchedTemplate && !isComingSoon}
                onClick={() => onChoosePackage(type)}
              >
                <span className="passenger-package-card__index">0{index + 1}</span>
                <strong>{type}</strong>
                <small>{isComingSoon
                  ? "正在建设中，敬请期待"
                  : matchedTemplate
                  ? `${matchedTemplate.sections.length - (matchedTemplate.pendingSections?.length ?? 0)}/${matchedTemplate.sections.length} 个模块已配置 · ${matchedTemplate.itemCount} 个检测项`
                  : "该标准模板暂未配置"}
                </small>
                <span className="passenger-package-card__footer">{isComingSoon ? "正在建设中，敬请期待" : matchedTemplate ? "选择此检测类型" : "暂不可用"} {!isComingSoon && <ArrowRight size={15} />}</span>
              </button>;
            })}
          </div>
        </>}

        <footer className="passenger-create-actions">
          {step === "standard"
            ? <button className="button button--secondary" onClick={onCancel}>取消</button>
            : <button className="button button--secondary" onClick={onBack}><ArrowLeft size={15} /> 上一步</button>}
        </footer>
      </section>
      <p className="passenger-create-footnote"><ShieldCheck size={15} /> 实际检测项目以机构审核发布的模板内容为准。</p>
    </section>
  </>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading__action">{action}</div>}</div>;
}

function HomeScreen({
  orders, reviewCount, searchValue, searchMessage, onSearchChange, onSearch, onNavigate, onSelectOrder, onFilterTemplates, onStartVehicleType,
}: {
  orders: Order[];
  reviewCount: number;
  searchValue: string;
  searchMessage: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onNavigate: (screen: Screen) => void;
  onSelectOrder: (order: Order) => void;
  onFilterTemplates: () => void;
  onStartVehicleType: (type: string) => void;
}) {
  const recent = orders.slice(0, 3);
  const todayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(new Date()).toUpperCase();
  return <>
    <section className="welcome-strip">
      <div><span className="welcome-date">{todayLabel} <i /></span><h1>早上好，林师傅 <span>✳</span></h1><p>把每一处细节，变成值得信赖的判断。</p></div>
      <div className="welcome-metric"><span>本月已完成</span><strong>28 <small>份报告</small></strong><div><span className="metric-trend"><ArrowUpRight size={13} /> 16.8%</span> 较上月</div></div>
      <div className="welcome-orbit"><div className="orbit-ring orbit-ring--one" /><div className="orbit-ring orbit-ring--two" /><div className="orbit-center"><Gauge size={26} /></div><span className="orbit-dot orbit-dot--a" /><span className="orbit-dot orbit-dot--b" /><span className="orbit-dot orbit-dot--c" /></div>
    </section>

    <div className="section-title section-title--start"><div><span className="eyebrow">START INSPECTION</span><h2>开始一次检测</h2><p>选择车辆类型与检测场景，创建专属检测任务。</p></div><button className="text-link" onClick={onFilterTemplates}>查看所有模板 <ArrowRight size={15} /></button></div>
    <div className="vehicle-entry-grid">
      <button className="vehicle-entry-card vehicle-entry-card--car" onClick={() => onStartVehicleType("二手车")}>
        <div className="vehicle-entry-card__top"><span className="category-chip"><CarFront size={14} /> 乘用车检测</span><span className="arrow-circle"><ArrowUpRight size={16} /></span></div>
        <h3>每一程，都有依据。</h3><p>二手车 · 新车 · 新能源</p>
        <div className="entry-divider" /><div className="entry-bottom"><span>国标 / 团标 · 灵活选择</span><VehicleIllustration compact /></div>
      </button>
      <button className="vehicle-entry-card vehicle-entry-card--moto vehicle-entry-card--disabled" type="button" disabled aria-label="摩托车检测，正在建设中，敬请期待">
        <div className="vehicle-entry-card__top"><span className="category-chip"><Bike size={14} /> 摩托车检测</span><span className="arrow-circle"><ArrowUpRight size={16} /></span></div>
        <h3>探索车况的另一面。</h3><p>二手车鉴定 · 机构团标</p>
        <div className="entry-divider" /><div className="entry-bottom"><span>按车型配置检查项</span><VehicleIllustration kind="摩托车" compact /></div>
        <span className="vehicle-entry-card__coming-soon">正在建设中，敬请期待</span>
      </button>
    </div>

    <div className="utility-grid">
      <div className="utility-card lookup-card">
        <div className="utility-card__heading"><span className="utility-icon utility-icon--blue"><Search size={17} /></span><div><strong>车辆信息查询</strong><small>车架号 / 车牌号核验</small></div><span className="api-tag">API 接入位</span></div>
        <div className="search-control"><Search size={17} /><input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onSearch()} placeholder="输入 VIN 码或车牌号" /><button onClick={onSearch}>查询车辆 <ArrowRight size={14} /></button></div>
        {searchMessage && <div className="lookup-hint"><Info size={14} />{searchMessage}</div>}
      </div>
      <button className="utility-card template-shortcut" onClick={onFilterTemplates}><span className="utility-icon utility-icon--amber"><Settings2 size={18} /></span><div><strong>检测项配置</strong><small>机构模板 · 项目动态组合</small></div><ArrowUpRight size={16} className="utility-arrow" /></button>
    </div>

    <section className="recent-section">
      <div className="section-title"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>今日工作</h2></div><button className="text-link" onClick={() => onNavigate("orders")}>全部订单 <ArrowRight size={15} /></button></div>
      <div className="dashboard-grid">
        <div className="recent-card">
          <div className="recent-card__head"><strong>最近检测订单</strong><span>{orders.length} 笔</span></div>
          {recent.map((order) => <button className="recent-order" key={order.id} onClick={() => onSelectOrder(order)}>
            <span className={`order-kind-icon ${order.kind === "摩托车" ? "order-kind-icon--moto" : ""}`}>{order.kind === "摩托车" ? <Bike size={17} /> : <CarFront size={17} />}</span>
            <span className="recent-order__main"><strong>{order.vehicle}</strong><small>{order.id} <i /> {order.date}</small></span>
            <StatusPill status={order.status} /><ChevronRight size={16} className="recent-order__arrow" />
          </button>)}
        </div>
        <div className="today-card">
          <div className="today-card__head"><div><span className="eyebrow">TODAY'S FOCUS</span><strong>进度概览</strong></div><span className="today-badge"><span /> 进行中</span></div>
          <div className="progress-stat"><span>今天的检测任务</span><strong>3 <small>/ 5 单</small></strong></div>
          <div className="progress-track"><span style={{ width: "60%" }} /></div>
          <div className="today-steps"><div className="today-step is-done"><span><Check size={12} /></span><strong>已完成</strong><small>1 单</small></div><div className="today-step is-live"><span>2</span><strong>进行中</strong><small>1 单</small></div><div className="today-step"><span>3</span><strong>待开始</strong><small>3 单</small></div></div>
          <button className="today-action" onClick={() => onNavigate("review")}>{reviewCount > 0 ? `还有 ${reviewCount} 份报告待审核` : "查看今日检测任务"} <ArrowRight size={15} /></button>
        </div>
      </div>
    </section>
  </>;
}

function OrdersScreen({ orders, filter, setFilter, onNewOrder, onSelect }: {
  orders: Order[]; filter: string; setFilter: (filter: string) => void; onNewOrder: () => void; onSelect: (order: Order) => void;
}) {
  const filters = ["全部", "待检测", "检测中", "待审核", "待修改", "已完成"];
  return <>
    <PageHeading eyebrow="INSPECTION ORDERS" title="检测订单" description="跟进每一次检测任务，从现场采集到报告发布。"
      action={<button className="button button--primary" onClick={onNewOrder}><Plus size={17} /> 新建检测订单</button>} />
    <div className="order-toolbar"><div className="filter-tabs">{filters.map((name) => <button key={name} className={filter === name ? "is-active" : ""} onClick={() => setFilter(name)}>{name}<span>{name === "全部" ? orders.length : undefined}</span></button>)}</div><button className="toolbar-icon" onClick={() => setFilter("全部")}><Filter size={16} /> 筛选</button></div>
    <div className="order-list-card">
      <div className="table-heading"><span>车辆 / 订单编号</span><span>检测套餐</span><span>检测师</span><span>创建时间</span><span>状态</span><span /></div>
      {orders.length === 0 ? <EmptyState title="暂无此状态的订单" description="切换筛选条件，或创建一笔新检测订单。" /> : orders.map((order) => (
        <button className="order-table-row" key={order.id} onClick={() => onSelect(order)}>
          <span className="order-vehicle"><span className={`order-kind-icon ${order.kind === "摩托车" ? "order-kind-icon--moto" : ""}`}>{order.kind === "摩托车" ? <Bike size={17} /> : <CarFront size={17} />}</span><span><strong>{order.vehicle}</strong><small>{order.id} <i /> {order.plate}</small></span></span>
          <span className="order-package">{order.packageName}<small>{order.kind} · {order.year}</small></span>
          <span className="table-inspector"><span className="avatar avatar--tiny">林</span>{order.inspector}</span>
          <span className="table-date">{order.date}</span>
          <StatusPill status={order.status} />
          <ChevronRight size={17} className="order-row-arrow" />
        </button>
      ))}
    </div>
    <div className="privacy-footnote"><ShieldCheck size={15} /> 检测过程自动记录操作时间，提交审核后本次检测内容锁定。</div>
  </>;
}

function TemplatesScreen({ kind, setKind, onCreate }: {
  kind: VehicleKind; setKind: (kind: VehicleKind) => void; onCreate: (template: Template) => void;
}) {
  const visible = templates.filter((template) => template.kind === kind);
  return <>
    <PageHeading eyebrow="INSPECTION LIBRARY" title="检测模板" description="按检测标准、车型与业务场景灵活配置报告项目。"
      action={<button className="button button--secondary" onClick={() => onCreate(visible[0])}><Plus size={16} /> 新建检测任务</button>} />
    <div className="template-banner"><div className="template-banner__mark"><Settings2 size={21} /></div><div><strong>项目，由你定义。</strong><span>模板决定检查清单、报告章节和必需照片。机构可按套餐管理多套模板。</span></div><span className="banner-count">{templates.length}<small>套模板</small></span></div>
    <div className="template-toolbar"><div className="filter-tabs">{(["乘用车", "摩托车"] as VehicleKind[]).map((value) => <button key={value} className={kind === value ? "is-active" : ""} onClick={() => setKind(value)}>{value}</button>)}</div><span className="template-tenant"><UsersRound size={15} /> 远行车辆检测 · 机构模板</span></div>
    <div className="template-grid">{visible.map((template, index) => <article className="template-card" key={template.id}>
      <div className="template-card__top"><div className={`template-card__icon template-card__icon--${index % 3}`}>{kind === "摩托车" ? <Bike size={20} /> : <CarFront size={20} />}</div><span className={`standard-badge ${template.standardType === "团标" ? "standard-badge--group" : ""}`}>{template.standardType}</span><button className="template-more" onClick={() => onCreate(template)} aria-label="使用模板"><MoreHorizontal size={19} /></button></div>
      <div className="template-card__meta">{template.kind} <i /> {template.vehicleType}</div>
      <h3>{template.name}</h3><div className="template-standard">{template.standard}</div><p>{template.description}</p>
      <div className="template-card__sections">{template.sections.slice(0, 4).map((section) => <span key={section}>{section}</span>)}{template.sections.length > 4 && <span>+{template.sections.length - 4}</span>}</div>
      <div className="template-card__footer"><span><ListChecks size={15} /> {template.itemCount} 个检查项</span><span>{template.sections.length} 个章节</span><button onClick={() => onCreate(template)}>使用模板 <ArrowRight size={14} /></button></div>
    </article>)}</div>
    <div className="standard-disclaimer"><Info size={15} /><span>当前模板清单仅用于原型演示。正式上线前应由机构管理员依据有效标准原文逐项校验，并维护标准版本、适用范围及更新记录。</span></div>
  </>;
}

function InspectScreen({ order, section, setSection, onResult, onCustomResult, onWaterNote, onThreshold, onPhoto, onBack, onSave, onSubmit, onNotify }: {
  order: Order; section: string; setSection: (section: string) => void; onResult: (index: number, result?: string) => void; onCustomResult: (index: number, customResult: string) => void; onWaterNote: (index: number, waterNote: string) => void; onThreshold: (index: number, thresholdFinding: InspectionItem["thresholdFinding"]) => void; onPhoto: (index: number, file: File) => void; onBack: () => void; onSave: () => void; onSubmit: () => void; onNotify: (message: string) => void;
}) {
  const inspectionTemplate = templates.find((item) => item.id === order.templateId) ?? templates[0];
  const sections = inspectionTemplate.sections;
  const selectedSection = sections.includes(section) ? section : sections[0];
  const checked = order.items.filter(isInspectionItemComplete).length;
  const sectionItems = order.items.map((item, index) => ({ item, index })).filter(({ item }) => item.section === selectedSection);
  const sectionChecked = sectionItems.filter(({ item }) => isInspectionItemComplete(item)).length;
  const sectionPending = inspectionTemplate.pendingSections?.includes(selectedSection) ?? false;
  const isDetailedGroupInspection = ["car-standard", "car-group", "car-three-group", "car-four-group"].includes(inspectionTemplate.id);
  const waterSiltCount = waterSiltFindingCount(order.items);
  const fireVehicleCount = fireVehicleFindingCount(order.items);
  const accidentVehicleCount = accidentVehicleFindingCount(order.items);
  return <>
    <div className="inspect-topline"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 返回</button><span className="inspection-id">{order.id} <i /> 检测任务</span><StatusPill status={order.status} /></div>
    <div className="inspect-heading"><div><div className="eyebrow">FIELD INSPECTION · {order.kind === "摩托车" ? "MOTORCYCLE" : "PASSENGER CAR"}</div><h1>{order.vehicle === "待录入车辆信息" || order.vehicle === "待录入摩托车信息" ? "现场检测" : order.vehicle}</h1><p>{order.packageName}{order.plate !== "待填写车牌" && <> <i /> {order.plate}</>}</p></div><div className="inspection-progress"><div className="progress-ring" style={{ "--progress": `${Math.round((checked / order.items.length) * 100)}%` } as React.CSSProperties}><strong>{Math.round((checked / order.items.length) * 100)}<small>%</small></strong></div><span>{checked} / {order.items.length} 项完成</span></div></div>
    {order.status === "待修改" && <div className="return-notice"><Info size={17} /><div><strong>审核意见：需要补充修改</strong><span>{order.returnNote ?? "请检查后重新提交。"}</span></div></div>}
    {waterSiltCount >= 3 && <VehicleFindingAlert kind="water" triggerKey={waterSiltCount} detail={`五个重点检测项中有 ${waterSiltCount} 项记录为水渍泥沙，已达到泡水车提示条件。`} />}
    {fireVehicleCount > 0 && <VehicleFindingAlert kind="fire" triggerKey={fireVehicleCount} popupOffset={waterSiltCount >= 3 ? 92 : 0} detail={`火烧检测发现 ${fireVehicleCount} 项烧蚀、熏黑碳化或炙烤融化情况。`} />}
    {accidentVehicleCount > 0 && <VehicleFindingAlert kind="accident" triggerKey={order.items.filter((item) => item.decisionType === "关键决定项" && item.thresholdOptions?.includes(item.result) && item.thresholdFinding === "大于30cm×30cm").map((item) => item.name).join("|")} popupOffset={(waterSiltCount >= 3 ? 92 : 0) + (fireVehicleCount > 0 ? 92 : 0)} detail={`关键决定项中有 ${accidentVehicleCount} 项损伤大于30cm×30cm，判定为事故车。`} />}
    <div className="inspection-layout">
      <aside className="inspection-sidebar"><span className="eyebrow">检测章节 <i>{sections.length}</i></span>{sections.map((name, index) => {
        const itemsInSection = order.items.filter((item) => item.section === name);
        const doneInSection = itemsInSection.filter(isInspectionItemComplete).length;
        const sectionNotReady = inspectionTemplate.pendingSections?.includes(name) ?? false;
        const sectionComplete = itemsInSection.length > 0 && doneInSection === itemsInSection.length;
        return <button key={name} className={`${selectedSection === name ? "is-active" : ""} ${sectionNotReady ? "is-pending" : ""} ${sectionComplete ? "is-complete" : ""}`} onClick={() => setSection(name)}><span className="section-index">{String(index + 1).padStart(2, "0")}</span><span>{name}</span><small>{sectionNotReady ? "待配置" : `${doneInSection}/${itemsInSection.length}`}</small></button>;
      })}<div className="inspection-sidebar__tip"><Info size={15} /><span>按模板逐项检查，异常项请记录情况并上传现场照片。</span></div></aside>
      <section className="inspection-work">
        <div className="inspection-work__head"><div><span className="eyebrow">SECTION {String(sections.indexOf(selectedSection) + 1).padStart(2, "0")} · CHECKLIST</span><h2>{selectedSection}</h2><p>{selectedSection === "重大事故检测" ? "关键决定项选择非正常结果后需判定是否大于30cm×30cm；非关键决定项无需尺寸判定。" : "请根据现场车辆状况填写检测结果，异常结果需附照片。"}</p></div><button className="text-link" onClick={() => onNotify("章节说明已展开")}><CircleHelp size={15} /> 判定说明</button></div>
        {sectionPending ? <div className="module-pending-notice"><span><Clock3 size={20} /></span><div><strong>该检测模块细则待补充</strong><p>该模块已纳入整车检测模板目录，检查项目及判定选项将在专业审核后配置。本模块暂不参与本次演示清单。</p></div></div> : <>
          <div className={`checklist-head ${isDetailedGroupInspection ? "checklist-head--group" : ""}`}><span>检测项目 <b>{sectionItems.length}</b> · 已完成 {sectionChecked}</span><span>检查结果</span><span>现场照片</span></div>
          <div className={`checklist ${isDetailedGroupInspection ? "checklist--group-inspection" : ""}`}>{sectionItems.map(({ item, index }, sectionIndex) => <div className={`checklist-row ${item.options ? "checklist-row--options" : ""}`} key={item.name}>
            <div className="checklist-row__name"><span className="check-number">{String(sectionIndex + 1).padStart(2, "0")}</span><div><strong>{item.name}</strong>{item.note && <small>{item.note}</small>}</div></div>
            <div className="checklist-row__result">
              {item.options
                ? <select className={`result-select ${item.material === "塑料件" ? "result-select--plastic" : item.material === "金属件" ? "result-select--metal" : inspectionResultClass(item)}`} value={item.result} onChange={(event) => onResult(index, event.target.value)} aria-label={`${item.name}检测结果`}>
                    {item.options.map((option) => <option className={item.material === "塑料件" ? "result-option--plastic" : item.material === "金属件" ? "result-option--metal" : ""} key={option} value={option}>{option}</option>)}
                  </select>
                : <button className={`result-button ${item.result === "正常" ? "result-button--good" : item.result === "待检查" ? "result-button--empty" : "result-button--issue"}`} onClick={() => onResult(index)}>{item.result}<ChevronDown size={14} /></button>}
              {(item.result === "自定义" || item.customNoteResults?.includes(item.result)) && <input className={`custom-result-input ${item.material === "塑料件" ? "custom-result-input--plastic" : "custom-result-input--metal"}`} value={item.customResult ?? ""} onChange={(event) => onCustomResult(index, event.target.value)} placeholder={item.customNotePrompt ?? "请输入自定义车况"} aria-label={`${item.name}${item.result === "自定义" ? "自定义车况" : item.customNoteLabel ?? "情况说明"}`} />}
              {item.requiresWaterNote && item.result === "水渍泥沙" && <input className="water-note-input" value={item.waterNote ?? ""} onChange={(event) => onWaterNote(index, event.target.value)} placeholder="请补充水渍泥沙情况说明（必填）" aria-label={`${item.name}水渍泥沙情况说明`} />}
              {item.thresholdOptions?.includes(item.result) && <div className="threshold-control" role="group" aria-label={`${item.name}损伤尺寸判定`}>
                <small>损伤尺寸（30cm×30cm）</small>
                <div>{(["大于30cm×30cm", "小于30cm×30cm"] as const).map((value) => <button key={value} type="button" className={item.thresholdFinding === value ? "is-selected" : ""} onClick={() => onThreshold(index, value)}>{value}</button>)}</div>
              </div>}
            </div>
            <label className={`photo-button ${item.photo ? "photo-button--added" : ""}`}><input className="photo-input" type="file" accept="image/*" capture="environment" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onPhoto(index, file);
              event.currentTarget.value = "";
            }} /><span>{item.photoUrl ? <img className="photo-mini" src={item.photoUrl} alt={`${item.name}现场照片`} loading="lazy" decoding="async" /> : item.photo ? <Check size={15} /> : <Camera size={15} />}</span>{item.photo ? "已拍摄" : "添加照片"}</label>
          </div>)}</div>
        </>}
        <div className="checklist-note"><Info size={14} /> {inspectionTemplate.pendingSections?.length
          ? `当前模板已配置 ${order.items.length} 个检测项，另有 ${inspectionTemplate.pendingSections.length} 个模块待补充；模板完整前暂不能提交审核。`
          : `当前展示 ${order.items.length} 个原型示范检测项；正式项目清单需按机构审核后的标准版本维护。`}
        </div>
        <div className="inspection-actions"><button className="button button--secondary" onClick={onSave}>保存草稿</button><div><span>提交后检测记录将锁定，审核退回后可修改。</span>        <button className="button button--primary" disabled={Boolean(inspectionTemplate.pendingSections?.length)} onClick={onSubmit}>提交审核 <ArrowRight size={15} /></button></div></div>
      </section>
    </div>
  </>;
}

function ReviewProgressScreen({ orders, onSelect }: { orders: Order[]; onSelect: (order: Order) => void }) {
  const submittedOrders = orders.filter((order) => ["待审核", "待修改", "已完成"].includes(order.status));
  const pendingCount = submittedOrders.filter((order) => order.status === "待审核").length;
  const returnedCount = submittedOrders.filter((order) => order.status === "待修改").length;
  const publishedCount = submittedOrders.filter((order) => order.status === "已完成").length;

  return <>
    <PageHeading eyebrow="INSPECTION PROGRESS" title="审核进度" description="查看本人提交的报告审核状态和处理结果。" />
    <div className="review-summary"><div className="review-summary__icon"><Clock3 size={20} /></div><div><strong>{pendingCount} 份报告等待机构管理员审核</strong><span>检测师可查看处理进度，审核通过、退回和发布由机构管理员负责。</span></div><span className="review-summary__label">提交进度</span></div>
    <div className="review-meta"><div><span>待审核</span><strong>{pendingCount} 份</strong></div><div><span>待修改</span><strong>{returnedCount} 份</strong></div><div><span>已发布</span><strong>{publishedCount} 份</strong></div></div>
    {submittedOrders.length === 0
      ? <EmptyState title="暂无已提交报告" description="完成检测并提交审核后，可在此查看审核进度。" />
      : <div className="review-queue">{submittedOrders.map((order) => <button key={order.id} onClick={() => onSelect(order)} className="review-queue-item">
          <span className="review-queue-item__vehicle">{order.kind === "摩托车" ? <Bike size={18} /> : <CarFront size={18} />}</span>
          <span><strong>{order.vehicle}</strong><small>{order.id}</small><small>{order.packageName}</small></span>
          <StatusPill status={order.status} /><ChevronRight size={16} />
        </button>)}</div>}
  </>;
}

function ReviewScreen({ orders, activeOrder, onSelect, onApprove, onReturn, onOpenOrders, onNotify }: {
  orders: Order[]; activeOrder: Order; onSelect: (order: Order) => void; onApprove: () => void; onReturn: () => void; onOpenOrders: () => void; onNotify: (message: string) => void;
}) {
  return <>
    <PageHeading eyebrow="QUALITY CONTROL" title="审核中心" description="逐项复核检测记录、异常说明与照片，确保每份报告都经得起推敲。"
      action={<button className="button button--secondary" onClick={onOpenOrders}>查看全部订单 <ArrowRight size={15} /></button>} />
    <div className="review-summary"><div className="review-summary__icon"><Clock3 size={20} /></div><div><strong>{orders.length} 份报告等待审核</strong><span>提交内容已锁定，审核通过后自动生成正式报告版本。</span></div><span className="review-summary__label">待处理</span></div>
    {orders.length === 0 ? <div className="empty-review"><div><CheckCheck size={28} /></div><h3>审核队列已清空</h3><p>新提交的检测报告会出现在这里。</p></div> : <div className="review-layout">
      <div className="review-queue"><div className="review-queue__head"><strong>待审核列表</strong><span>{orders.length} 份</span></div>{orders.map((order) => <button key={order.id} onClick={() => onSelect(order)} className={`review-queue-item ${activeOrder.id === order.id ? "is-active" : ""}`}><span className="review-queue-item__vehicle">{order.kind === "摩托车" ? <Bike size={18} /> : <CarFront size={18} />}</span><span><strong>{order.vehicle}</strong><small>{order.id}</small><small>{order.packageName}</small></span><ChevronRight size={16} /></button>)}</div>
      <div className="review-detail"><div className="review-detail__head"><div><span className="eyebrow">SUBMISSION REVIEW</span><h2>{activeOrder.vehicle}</h2><p>{activeOrder.id} <i /> {activeOrder.date} 提交</p></div><StatusPill status={activeOrder.status} /></div>
        <div className="review-meta"><div><span>检测师</span><strong>{activeOrder.inspector}</strong></div><div><span>检测方案</span><strong>{activeOrder.packageName}</strong></div><div><span>检查项目</span><strong>{activeOrder.items.length} 项 <i className="text-success">· 已记录</i></strong></div><div><span>现场照片</span><strong>{activeOrder.items.filter((item) => item.photo).length} 张 <i className="text-success">· 已上传</i></strong></div></div>
        <div className="review-block"><div className="review-block__head"><strong>项目与结果抽查</strong><button className="text-link" onClick={() => onNotify("已展示本次检测项目")} >查看全部 <ArrowRight size={14} /></button></div>{activeOrder.items.slice(0, 5).map((item) => <div className="review-check-row" key={item.name}><span>{item.name}</span><span className={item.result === "正常" ? "text-success" : item.result === "待检查" ? "text-muted" : "text-warning"}>{inspectionResultLabel(item)}</span><span>{item.photo ? <><ImagePlus size={14} /> 有照片</> : <span className="text-muted">无照片</span>}</span><ChevronRight size={15} /></div>)}</div>
        <div className="review-attention"><Info size={16} /><span>请核验异常项照片清晰度、检测结论与必检项目完整性后再审核。</span></div>
        <div className="review-actions"><button className="button button--secondary button--return" onClick={onReturn}>退回修改</button><button className="button button--primary" onClick={onApprove}><Check size={16} /> 审核通过并发布报告</button></div>
      </div>
    </div>}
  </>;
}

function ReportScreen({ order, onShare, onBack, isPublic }: { order: Order; onShare: () => void; onBack: () => void; isPublic: boolean }) {
  const flagged = order.items.filter((item) => !["正常", "待检查"].includes(item.result));
  const photoItems = order.items.filter((item) => item.photo);
  const waterSiltCount = waterSiltFindingCount(order.items);
  const fireVehicleCount = fireVehicleFindingCount(order.items);
  return <>
    {!isPublic && <div className="report-actions-top"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 返回订单</button><span className="report-version"><ShieldCheck size={15} /> 正式报告 · V1.0</span></div>}
    <article className="report-paper">
      <div className="report-cover"><div className="report-cover__brand"><IconMark /><span><strong>鉴见</strong><small>远行车辆检测</small></span></div><span className="report-official"><Check size={13} /> 已审核发布</span>
        <div className="report-cover__title"><span className="eyebrow">VEHICLE CONDITION REPORT</span><h1>车辆检测报告</h1><p>每一处判断，都有迹可循。</p></div>
        <VehicleIllustration kind={order.kind} />
        <div className="report-cover__vehicle"><div><span>检测车辆</span><strong>{order.vehicle}</strong></div><div><span>车牌号码</span><strong>{order.plate}</strong></div><div><span>报告编号</span><strong>{order.id}-R01</strong></div></div>
        <div className="report-stamp">机构认证<br /><strong>CHECKED</strong></div>
      </div>
      <div className="report-body">
        {waterSiltCount >= 3 && <VehicleFindingAlert kind="water" triggerKey={waterSiltCount} detail={`五个重点检测项中有 ${waterSiltCount} 项记录为水渍泥沙。`} />}
        {fireVehicleCount > 0 && <VehicleFindingAlert kind="fire" triggerKey={fireVehicleCount} popupOffset={waterSiltCount >= 3 ? 92 : 0} detail={`火烧检测发现 ${fireVehicleCount} 项烧蚀、熏黑碳化或炙烤融化情况。`} />}
        <div className="report-score-row"><div><span className="eyebrow">INSPECTION OVERVIEW</span><h2>检测结论</h2><p>本报告依据所选检测模板对车辆进行现场检测。</p></div><div className="score-seal"><span>综合评估</span><strong>{flagged.length ? "良" : "优"}</strong><small>仅供参考</small></div></div>
        <div className="report-summary-grid"><div><span>检测方案</span><strong>{order.packageName}</strong></div><div><span>检测师</span><strong>{order.inspector}</strong></div><div><span>检测时间</span><strong>{order.date}</strong></div><div><span>表显里程</span><strong>{order.mileage}</strong></div></div>
        <div className="report-highlight"><span className="report-highlight__icon"><Info size={17} /></span><div><strong>车况摘要</strong><p>{flagged.length ? `本次检测发现 ${flagged.length} 项需关注的外观或结构情况，建议结合实车及维修记录进一步核验。` : "本次检查项目未记录明显异常，请结合车辆实际状况及检测范围综合判断。"}</p></div></div>
        <section className="report-section"><div className="report-section__title"><span>01</span><h3>车辆基本信息</h3><i /></div><div className="report-info-table"><div><span>车辆类型</span><strong>{order.kind}</strong><span>车辆名称</span><strong>{order.vehicle}</strong></div><div><span>首次上牌</span><strong>{order.year}</strong><span>表显里程</span><strong>{order.mileage}</strong></div><div><span>检测套餐</span><strong>{order.packageName}</strong><span>报告版本</span><strong>正式版 · V1.0</strong></div></div><div className="report-photo-strip">{photoItems.length ? photoItems.map((item, index) => <div className={`report-photo report-photo--${index % 3}`} key={item.name}>{item.photoUrl ? <img src={item.photoUrl} alt={`${item.name}现场照片`} loading="lazy" decoding="async" /> : <VehicleIllustration kind={order.kind} compact />}<span>{item.name}{item.photoUrl ? "" : " · 演示图"}</span></div>) : <div className="photo-empty">本次检测尚未上传现场照片。</div>}</div></section>
        <section className="report-section"><div className="report-section__title"><span>02</span><h3>检测结果</h3><i /><small>{order.items.length} 个项目</small></div><div className="report-result-list">{order.items.map((item, index) => <div className="report-result-row" key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong><span className={item.result === "正常" ? "text-success" : item.result === "待检查" ? "text-muted" : "text-warning"}>{inspectionResultLabel(item)}</span>{item.photo ? <span className="photo-count"><ImagePlus size={14} /> 1 张照片</span> : <span className="text-muted">—</span>}</div>)}</div></section>
        <section className="report-section"><div className="report-section__title"><span>03</span><h3>检测现场影像</h3><i /><small>{photoItems.length} 张照片</small></div>{photoItems.length ? <div className="report-evidence-grid">{photoItems.map((item) => <div className="evidence-card" key={item.name}>{item.photoUrl ? <img className="evidence-photo" src={item.photoUrl} alt={`${item.name}现场照片`} loading="lazy" decoding="async" /> : <VehicleIllustration kind={order.kind} compact />}<div><strong>{item.name}</strong><span>{item.result} · {item.photoUrl ? "检测师现场上传" : "原型演示图片"}</span></div><ArrowUpRight size={15} /></div>)}</div> : <div className="photo-empty">本次检测尚未上传现场照片。</div>}</section>
        <div className="report-disclaimer"><ShieldCheck size={17} /><p>本报告展示所选检测模板覆盖范围内的检查结果，不构成对车辆未来状态的保证。未检测部位及使用过程中发生的变化不在本报告范围内。车辆交易决策请结合实车、相关凭证及其他专业意见综合判断。</p></div>
      </div>
      <div className="report-footer"><div className="report-footer__brand"><IconMark /><span><strong>鉴见</strong><small>可信赖的车辆检测协作平台</small></span></div><span>报告编号：{order.id}-R01<br />机构：远行车辆检测</span></div>
    </article>
    {!isPublic && order.status === "已完成" && <div className="report-share-bar"><div><ShieldCheck size={18} /><span><strong>正式报告已发布</strong><small>委托人无需注册即可查看报告与照片</small></span></div><button className="button button--primary" onClick={onShare}>分享报告 <Link2 size={16} /></button></div>}
  </>;
}

function ProfileScreen({ orders, currentRole, onRoleChange, onNavigate, onSelectOrder, onOpenHistory }: {
  orders: Order[];
  currentRole: OrganizationRole;
  onRoleChange: (role: OrganizationRole) => void;
  onNavigate: (screen: Screen) => void;
  onSelectOrder: (order: Order) => void;
  onOpenHistory: () => void;
}) {
  const completed = orders.filter((order) => order.status === "已完成");
  const roles = [
    { name: "机构管理员", members: 1, description: "机构资料、成员与权限管理", fixed: true },
    { name: "检测师", members: 8, description: "创建订单、现场检测、提交报告并查看审核进度", fixed: true },
  ] as const;
  const [rolesOpen, setRolesOpen] = useState(false);

  return <>
    <PageHeading eyebrow="YOUR PROFILE" title="个人主页" description="管理个人检测任务、历史报告与机构工作空间。" />
    <div className="profile-hero"><div className="profile-avatar">{currentRole === "检测师" ? "林" : "周"}<span /></div><div className="profile-identity"><span className="eyebrow">{currentRole === "检测师" ? "INSPECTOR · ID 0286" : "ORGANIZATION ADMINISTRATOR"}</span><h2>{currentRole === "检测师" ? "林师傅" : "周经理"}</h2><p>{currentRole} <i /> 远行车辆检测</p><div className="profile-badges"><span><ShieldCheck size={13} /> 机构认证</span><span>{currentRole === "检测师" ? "从业 6 年" : "机构管理权限"}</span><span>{currentRole === "检测师" ? "已完成 128 份检测" : "审核与报告发布"}</span></div></div><button className="button button--secondary profile-edit" onClick={() => onNavigate("orders")}><Settings2 size={16} /> 工作设置</button></div>
    <div className="profile-stats"><div><span>累计检测</span><strong>{orders.length + 124}<small> 单</small></strong><small>全程可追溯</small></div><div><span>已发布报告</span><strong>{completed.length + 95}<small> 份</small></strong><small>正式报告版本</small></div><div><span>本月完成</span><strong>28<small> 单</small></strong><small className="profile-growth"><ArrowUpRight size={13} /> 较上月 +16.8%</small></div><div><span>平均审核时效</span><strong>2.4<small> 小时</small></strong><small>机构审核数据</small></div></div>
    <div className="profile-columns"><div className="profile-card"><div className="profile-card__heading"><h3>我的检测订单</h3><button className="text-link" onClick={() => onNavigate("orders")}>全部 <ArrowRight size={14} /></button></div>{orders.slice(0, 3).map((order) => <button className="profile-order" key={order.id} onClick={() => onSelectOrder(order)}><span className="profile-order__icon">{order.kind === "摩托车" ? <Bike size={17} /> : <CarFront size={17} />}</span><span><strong>{order.vehicle}</strong><small>{order.id} · {order.date}</small></span><StatusPill status={order.status} /><ChevronRight size={15} /></button>)}</div><div className="profile-card"><div className="profile-card__heading"><h3>机构工作空间</h3><span className="tenant-status"><i /> 已认证</span></div><div className="organization-card"><div className="organization-logo">远</div><div><strong>远行车辆检测</strong><span>机构管理员：周经理</span><span>成员：8 位检测师 · 1 位管理员</span></div></div><button className="role-preview" onClick={() => setRolesOpen(true)}><span><UsersRound size={15} /> 角色与权限</span><span>当前：{currentRole}</span><ChevronRight size={16} /></button><div className="org-permission-note"><Info size={14} /> 检测师负责检测和提交报告；仅机构管理员可以审核、退回或发布报告。</div></div></div>
    <div className="profile-bottom-links"><button onClick={() => onNavigate("templates")}><ListChecks size={17} /><span><strong>检测模板</strong><small>机构标准与套餐配置</small></span><ChevronRight size={16} /></button><button onClick={onOpenHistory}><FileText size={17} /><span><strong>历史报告</strong><small>已完成检测与正式报告</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate("review")}><FileCheck2 size={17} /><span><strong>审核进度</strong><small>查看提交与审核状态</small></span><ChevronRight size={16} /></button></div>
    {rolesOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRolesOpen(false); }}><section className="modal-card roles-modal" role="dialog" aria-modal="true" aria-labelledby="roles-title"><div className="modal-heading"><div><span className="eyebrow">ORGANIZATION ACCESS</span><h2 id="roles-title">角色与权限</h2></div><button className="icon-button" onClick={() => setRolesOpen(false)} aria-label="关闭"><X size={20} /></button></div><div className="tenant-scope-note"><ShieldCheck size={16} /><span><strong>远行车辆检测 · 独立机构空间</strong><small>机构仅设置检测师和机构管理员两种角色；机构管理员审核、退回并发布报告。</small></span></div><div className="role-list">{roles.map((role) => <div className="role-card" key={role.name}><div className="role-card__icon">{role.fixed ? <ShieldCheck size={16} /> : <UsersRound size={16} />}</div><div><strong>{role.name}{role.name === "机构管理员" && <i>平台开通</i>}</strong><span>{role.description}</span></div><small>{role.members} 位成员</small></div>)}</div><label className="field-label role-create-label" htmlFor="member-role">当前演示权限</label><div className="member-assignment"><span><span className="avatar avatar--tiny">{currentRole === "检测师" ? "林" : "周"}</span> {currentRole === "检测师" ? "林师傅" : "周经理"}</span>    <select id="member-role" value={currentRole} onChange={(event) => onRoleChange(event.target.value === "机构管理员" ? "机构管理员" : "检测师")}>{roles.map((role) => <option value={role.name} key={role.name}>{role.name}</option>)}</select></div><div className="role-warning"><Info size={14} /> 当前切换仅用于原型权限演示；正式系统应由服务端校验当前账号角色及租户权限。</div><div className="modal-actions"><button className="button button--secondary" onClick={() => setRolesOpen(false)}>完成</button></div></section></div>}
  </>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div><Search size={21} /></div><strong>{title}</strong><span>{description}</span></div>;
}
