import {rooms} from '../museum-layout.mjs';
import {artworkFrameStyle} from '../artwork-scale.mjs';
export const theme = {
  eyebrow: '第一展厅 / REMBRANDT', tagline: ['在明暗之间，', '遇见人性的温度。'],
  footer: '本展为近似空间 · 现行陈列位置待确认',
  about: ['空间参考冬宫官方全景 node172—176，展厅尺寸、布画、展签与灯光为适合浏览器漫游的近似设计。馆藏归属不等于现行254号厅陈列；当前实际陈列状态待确认。', '图片优先使用用户提供的本地资源。保存来源链接、作者、年代、像素与许可核查状态。部分归属、尺寸或图源对应关系待确认，详见作品档案。'],
  id: 'hermitage-rembrandt', title: '伦勃朗厅', subtitle: '冬宫 · 伦勃朗馆藏',
  museum: '冬宫博物馆', artist: '伦勃朗·范·莱因',
  note: '以冬宫伦勃朗厅为灵感的近似空间，结合馆藏策展，非精确复原。作品现行陈列位置待确认。',
  room: rooms[0],
  lighting: {ambient:1.3,key:1.1,spotColor:0xffdda7,spotIntensity:48,railInset:1.4,ceilingGap:.48},
  frame: artworkFrameStyle,
  initial: { x: 0, y: 1.65, z: 0, yaw: 0 },
};
export const VERSION = '1.4.0 · 20261024';
