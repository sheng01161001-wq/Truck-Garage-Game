// 卡車改裝王 X：台灣路網區域資料（模組化：之後每做好一個區域，就把 open 改成 true、填上 scene 載入函式）
// 經緯度是真實位置（世界地圖的台灣小圖用），遊戲裡目前開放的是「台中示範區」（js/world.js＋js/highway.js 的地圖）
export const TAIWAN_OUTLINE = [
  [121.53, 25.30], [121.75, 25.18], [121.93, 25.03], [121.85, 24.85], [121.86, 24.60], [121.74, 24.30], [121.63, 24.00],
  [121.50, 23.50], [121.37, 23.10], [121.15, 22.75], [120.95, 22.45], [120.85, 22.20], [120.83, 21.90], [120.72, 21.95],
  [120.62, 22.30], [120.42, 22.48], [120.30, 22.60], [120.17, 22.95], [120.08, 23.20], [120.13, 23.50], [120.22, 23.85],
  [120.42, 24.25], [120.62, 24.55], [120.88, 24.85], [121.03, 25.05], [121.30, 25.15], [121.53, 25.30],
];
// 區域：area 北中南東；open＝目前可以開
export const REGIONS = [
  { id: 'taipei', name: '台北', area: '北部', lon: 121.56, lat: 25.04, open: false },
  { id: 'newtaipei', name: '新北', area: '北部', lon: 121.46, lat: 25.01, open: false },
  { id: 'keelung', name: '基隆', area: '北部', lon: 121.74, lat: 25.13, open: false, port: true },
  { id: 'taoyuan', name: '桃園', area: '北部', lon: 121.30, lat: 24.99, open: false },
  { id: 'hsinchu', name: '新竹', area: '北部', lon: 120.97, lat: 24.80, open: false },
  { id: 'taichung', name: '台中', area: '中部', lon: 120.68, lat: 24.15, open: true, port: true, note: '台中示範區：市區、台中港、工業區、國道 3 號山區線、南投林場' },
  { id: 'changhua', name: '彰化', area: '中部', lon: 120.54, lat: 24.08, open: false },
  { id: 'nantou', name: '南投', area: '中部', lon: 120.68, lat: 23.91, open: false },
  { id: 'yunlin', name: '雲林', area: '南部', lon: 120.43, lat: 23.70, open: false },
  { id: 'chiayi', name: '嘉義', area: '南部', lon: 120.45, lat: 23.48, open: false },
  { id: 'tainan', name: '台南', area: '南部', lon: 120.21, lat: 22.99, open: false },
  { id: 'kaohsiung', name: '高雄', area: '南部', lon: 120.31, lat: 22.62, open: false, port: true },
  { id: 'hualien', name: '花蓮', area: '東部', lon: 121.60, lat: 23.99, open: false },
  { id: 'taitung', name: '台東', area: '東部', lon: 121.15, lat: 22.76, open: false },
];
// 國道（示意路線，用區域串起來）
export const FREEWAYS = [
  { name: '國道1號', color: '#3a8de0', via: [[121.74, 25.13], [121.56, 25.06], [121.30, 25.00], [120.97, 24.82], [120.70, 24.20], [120.54, 24.07], [120.45, 23.72], [120.45, 23.48], [120.23, 23.00], [120.31, 22.62]] },
  { name: '國道3號', color: '#2bb673', via: [[121.73, 25.10], [121.46, 24.98], [121.25, 24.90], [121.02, 24.75], [120.75, 24.10], [120.66, 23.92], [120.53, 23.70], [120.50, 23.45], [120.32, 22.98], [120.40, 22.60]] },
  { name: '國道5號', color: '#e0a23a', via: [[121.56, 25.03], [121.75, 24.75], [121.80, 24.60]] },
];
export const currentRegion = () => REGIONS.find((r) => r.open);
