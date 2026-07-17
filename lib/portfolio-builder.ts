/* Portfolio Builder — data layer (ported from soulsilent-portfolio-data.jsx).
 * Plain data + helpers; no JSX. Sticker SVGs are strings rendered via
 * dangerouslySetInnerHTML in the engine.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const CANVAS_W = 1200;
export const CANVAS_H_MIN = 1700;

export type Localized = { th: string; en: string };

export interface PNode {
  id: string;
  type: 'text' | 'image' | 'shape' | 'sticker' | 'link' | 'embed' | 'contact' | 'credential';
  x: number; y: number; w: number; h: number; z: number;
  rot?: number;
  opacity?: number;
  /** When true the node can't be dragged/resized/rotated on the canvas. */
  locked?: boolean;
  styles?: Record<string, any>;
  animation?: { preset?: string | null; duration?: number; delay?: number } | null;
  link?: { href?: string; target?: string };
  content?: Record<string, any>;
}

export interface PortfolioDoc {
  id: string;
  owner: string;
  title: Localized;
  subtitle: Localized;
  visibility: 'private' | 'public';
  slug: string;
  template: string;
  canvasH: number;
  canvasBg: string;
  nodes: PNode[];
  updatedAt: string;
}

export const nid = (() => { let i = 0; return (p = 'n') => `${p}_${Date.now().toString(36)}${(i++).toString(36)}`; })();

/* Animation presets. `key` values are stable (saved in documents); only labels
 * are tuned for clarity. Entrance anims (fade/rise/zoom/slide) play once when
 * scrolled into view; loop anims (float/pulse) run continuously; hover-zoom is
 * a desktop pointer effect. */
export const ANIM_PRESETS = [
  { key:'none',        th:'ไม่มี',              en:'None' },
  { key:'fade-in',     th:'ค่อยๆ ปรากฏ',       en:'Fade in' },
  { key:'rise',        th:'เลื่อนขึ้น + จาง',    en:'Slide up' },
  { key:'zoom-in',     th:'ซูมเข้า',           en:'Zoom in' },
  { key:'slide-left',  th:'เลื่อนจากซ้าย',      en:'Slide from left' },
  { key:'slide-right', th:'เลื่อนจากขวา',       en:'Slide from right' },
  { key:'float',       th:'ลอยวนเบาๆ',         en:'Float (loop)' },
  { key:'pulse',       th:'เต้นเบาๆ',          en:'Pulse (loop)' },
  { key:'magnetic',    th:'ขยายเมื่อชี้',       en:'Hover zoom' },
];

export const SHAPES = {
  rect:   { th:'สี่เหลี่ยม', en:'Rectangle', clip:'none' },
  circle: { th:'วงกลม',     en:'Circle',    clip:'circle(50% at 50% 50%)' },
  pill:   { th:'แคปซูล',     en:'Pill',      clip:'none', radius:9999 },
  arch:   { th:'ซุ้มโค้ง',   en:'Arch',      clip:'path("M0,100 L0,50 A50,50 0 0,1 100,50 L100,100 Z")' },
  blob:   { th:'บลอบ',       en:'Blob',      clip:'path("M50,0 C75,5 100,25 95,55 C90,85 65,100 40,95 C15,90 0,65 5,40 C10,15 25,-5 50,0 Z")' },
  star:   { th:'ดาว',        en:'Star',      clip:'path("M50,3 L62,38 L98,38 L68,60 L80,95 L50,73 L20,95 L32,60 L2,38 L38,38 Z")' },
  diamond:{ th:'ข้าวหลามตัด', en:'Diamond',   clip:'path("M50,0 L100,50 L50,100 L0,50 Z")' },
  ellipse:{ th:'รูปไข่',     en:'Ellipse',   clip:'ellipse(50% 40% at 50% 50%)' },
  hex:    { th:'หกเหลี่ยม',  en:'Hexagon',   clip:'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)' },
};


export const STICKERS = [
  { key:'sun',     th:'ดวงอาทิตย์', en:'Sun',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#f5c243" stroke-width="3.5" stroke-linecap="round"><circle cx="50" cy="50" r="18" fill="#f5c243"/><path d="M50 10v8M50 82v8M10 50h8M82 50h8M22 22l5 5M73 73l5 5M22 78l5-5M73 27l5-5"/></g></svg>` },
  { key:'moon',    th:'พระจันทร์', en:'Moon',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M62 14a40 40 0 1 0 24 76A32 32 0 0 1 62 14Z" fill="#0d1e1d"/></svg>` },
  { key:'wave',    th:'คลื่นทะเล', en:'Wave',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#0d8a7e" stroke-width="3.5" stroke-linecap="round"><path d="M5 40 Q20 25 35 40 T65 40 T95 40"/><path d="M5 60 Q20 45 35 60 T65 60 T95 60"/><path d="M5 80 Q20 65 35 80 T65 80 T95 80"/></g></svg>` },
  { key:'leaf',    th:'ใบไม้', en:'Leaf',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M20 80 C 20 30 50 10 85 15 C 90 50 70 85 20 80 Z" fill="#0d8a7e"/><path d="M28 75 L 70 30" stroke="#075a51" stroke-width="3" fill="none" stroke-linecap="round"/></svg>` },
  { key:'arrow',   th:'ลูกศรขีดเขียน', en:'Hand arrow',
    svg:`<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#0d1e1d" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 30 Q 50 5 95 30 M85 18 L100 30 L86 42"/></g></svg>` },
  { key:'spiral',  th:'ก้นหอย', en:'Spiral',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 50 m -3 0 a 3 3 0 1 1 6 0 a 7 7 0 1 1 -14 0 a 14 14 0 1 1 28 0 a 22 22 0 1 1 -44 0 a 32 32 0 1 1 64 0" fill="none" stroke="#0d1e1d" stroke-width="3" stroke-linecap="round"/></svg>` },
  { key:'star4',   th:'ประกายดาว', en:'Sparkle',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 5 C 55 40 60 45 95 50 C 60 55 55 60 50 95 C 45 60 40 55 5 50 C 40 45 45 40 50 5 Z" fill="#f5c243"/></svg>` },
  { key:'heart',   th:'หัวใจ', en:'Heart',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 88 C 5 60 5 25 30 18 C 42 14 50 22 50 30 C 50 22 58 14 70 18 C 95 25 95 60 50 88 Z" fill="#d35d52"/></svg>` },
  { key:'cup',     th:'แก้วกาแฟ', en:'Coffee cup',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#0d1e1d" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 35 H72 V70 A12 12 0 0 1 60 82 H34 A12 12 0 0 1 22 70 Z" fill="#f6f1e6"/><path d="M72 42 H82 A8 8 0 0 1 82 62 H72"/><path d="M32 22 Q 36 28 32 32 M44 22 Q 48 28 44 32 M56 22 Q 60 28 56 32"/></g></svg>` },
  { key:'cloud',   th:'ก้อนเมฆ', en:'Cloud',
    svg:`<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"><path d="M30 60 A 18 18 0 1 1 45 28 A 20 20 0 0 1 80 28 A 16 16 0 0 1 95 60 Z" fill="#a5d9d1"/></svg>` },
  { key:'flower',  th:'ดอกไม้', en:'Flower',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="#f59e7a"><circle cx="50" cy="22" r="14"/><circle cx="78" cy="50" r="14"/><circle cx="50" cy="78" r="14"/><circle cx="22" cy="50" r="14"/></g><circle cx="50" cy="50" r="12" fill="#f5c243"/></svg>` },
  { key:'badge-th',  th:'ตรา ✦', en:'Badge ✦',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="42" fill="none" stroke="#0d1e1d" stroke-width="3" stroke-dasharray="3 5"/><text x="50" y="60" text-anchor="middle" font-family="Mitr" font-size="34" fill="#0d1e1d">✦</text></svg>` },
  { key:'sound',   th:'คลื่นเสียง', en:'Sound waves',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="#0d8a7e"><rect x="10" y="42" width="6" height="16" rx="3"/><rect x="24" y="30" width="6" height="40" rx="3"/><rect x="38" y="22" width="6" height="56" rx="3"/><rect x="52" y="36" width="6" height="28" rx="3"/><rect x="66" y="26" width="6" height="48" rx="3"/><rect x="80" y="40" width="6" height="20" rx="3"/></g></svg>` },
  { key:'underline', th:'เส้นใต้', en:'Underline',
    svg:`<svg viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg"><path d="M5 18 Q 60 5 115 18" fill="none" stroke="#f5c243" stroke-width="6" stroke-linecap="round"/></svg>` },
  { key:'circle-mark', th:'วงกลมเน้น', en:'Circle mark',
    svg:`<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg"><path d="M10 35 Q 60 5 110 35 Q 60 65 10 35" fill="none" stroke="#d35d52" stroke-width="4" stroke-linecap="round"/></svg>` },
  { key:'dots',    th:'จุด', en:'Dots',
    svg:`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="#0d1e1d"><circle cx="20" cy="50" r="8"/><circle cx="50" cy="50" r="8"/><circle cx="80" cy="50" r="8"/></g></svg>` },
];

export const SAMPLE_CREDENTIALS = [
  { id:'c1', th:'เซรามิกยามบ่าย', en:'Afternoon Ceramics', date:'28 มิ.ย. 2026', tone:'cream' },
  { id:'c2', th:'ทะเล ก้อนเมฆ และความเงียบ', en:'Sea, Clouds & Silence', date:'14 มิ.ย. 2026', tone:'teal' },
  { id:'c3', th:'เขียนภาวนา ยามเช้า', en:'Morning Writing & Meditation', date:'2 พ.ค. 2026', tone:'ink' },
];

export function tplEmpty() {
  return [
    { id:nid(), type:'text', x:60, y:80, w:600, h:90, z:2,
      content:{ text:'เริ่มต้นสร้าง Portfolio ของคุณ', tag:'h1' },
      styles:{ fontFamily:'Mitr', fontSize:54, fontWeight:500, color:'#0d1e1d', align:'left', lineHeight:1.05 },
      animation:{ preset:'rise', duration:700, delay:0 } },
    { id:nid(), type:'text', x:60, y:185, w:560, h:60, z:2,
      content:{ text:'ลากองค์ประกอบจากแผงด้านซ้ายมาวางบนแคนวาส · กดปุ่ม Preview เพื่อดูผลลัพธ์', tag:'p' },
      styles:{ fontFamily:'IBM Plex Sans Thai', fontSize:17, color:'#6a7a78', align:'left', lineHeight:1.6 },
      animation:{ preset:'fade-in', duration:700, delay:200 } },
  ];
}

export function tplParticipant() {
  return [
    /* hero band */
    { id:nid(), type:'shape', x:0, y:0, w:1200, h:380, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#0d1e1d', radius:0 } },
    { id:nid(), type:'sticker', x:920, y:30, w:260, h:260, z:2, rot:18,
      content:{ key:'sun' }, animation:{ preset:'float' } },
    { id:nid(), type:'sticker', x:60, y:300, w:80, h:80, z:3,
      content:{ key:'spiral' }, styles:{ tint:'#f5c243' } },

    { id:nid(), type:'text', x:60, y:90, w:780, h:70, z:4,
      content:{ text:'ANANTA A.', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:13, color:'#f5c243', letterSpacing:'.22em', align:'left' } },
    { id:nid(), type:'text', x:60, y:130, w:880, h:130, z:4,
      content:{ text:'เดินทางช้า ๆ\nและจดจำเสียงคลื่น', tag:'h1' },
      styles:{ fontFamily:'Mitr', fontSize:72, fontWeight:500, color:'#fff', align:'left', lineHeight:1, letterSpacing:'-.012em' },
      animation:{ preset:'rise', duration:800 } },
    { id:nid(), type:'text', x:60, y:300, w:560, h:50, z:4,
      content:{ text:'Slow traveller · seaside journaller · collecting silence since 2024', tag:'p' },
      styles:{ fontFamily:'Caveat', fontSize:24, color:'#a5d9d1', align:'left' } },

    /* about block */
    { id:nid(), type:'shape', x:60, y:440, w:520, h:340, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#f6f1e6', radius:28 } },
    { id:nid(), type:'text', x:90, y:470, w:160, h:24, z:2,
      content:{ text:'· เกี่ยวกับฉัน', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.18em', align:'left' } },
    { id:nid(), type:'text', x:90, y:500, w:460, h:240, z:2,
      content:{ text:'ฉันเรียนรู้จากทะเล จากเช้าวันเงียบ และจากคนแปลกหน้าที่เดินผ่านในตลาดเก่า — Portfolio นี้เป็นบันทึกของวันที่ฉันได้ลองทำอะไรช้า ๆ และใส่ใจ', tag:'p' },
      styles:{ fontFamily:'IBM Plex Sans Thai', fontSize:18, color:'#1a2e2c', align:'left', lineHeight:1.65 },
      animation:{ preset:'fade-in', duration:700 } },

    /* portrait shape */
    { id:nid(), type:'shape', x:640, y:440, w:340, h:340, z:1,
      content:{ shape:'blob' }, styles:{ fill:'#a5d9d1' } },
    { id:nid(), type:'image', x:670, y:470, w:280, h:280, z:2,
      content:{ shape:'blob', slot:'pf-portrait', placeholder:'portrait' },
      animation:{ preset:'float' } },
    { id:nid(), type:'sticker', x:990, y:680, w:110, h:110, z:3, rot:-12,
      content:{ key:'sparkle' } },
    { id:nid(), type:'sticker', x:980, y:430, w:130, h:60, z:3,
      content:{ key:'underline' } },

    /* credentials section */
    { id:nid(), type:'text', x:60, y:830, w:600, h:40, z:2,
      content:{ text:'workshops attended ·', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.18em', align:'left' } },
    { id:nid(), type:'text', x:60, y:855, w:600, h:60, z:2,
      content:{ text:'สิ่งที่ฉันเรียนรู้', tag:'h2' },
      styles:{ fontFamily:'Mitr', fontSize:38, fontWeight:500, color:'#0d1e1d', align:'left', lineHeight:1.05 } },
    { id:nid(), type:'credential', x:60, y:940, w:340, h:170, z:2,
      content:{ credId:'c2' }, animation:{ preset:'rise', duration:700 } },
    { id:nid(), type:'credential', x:420, y:940, w:340, h:170, z:2,
      content:{ credId:'c1' }, animation:{ preset:'rise', duration:700, delay:120 } },
    { id:nid(), type:'credential', x:780, y:940, w:340, h:170, z:2,
      content:{ credId:'c3' }, animation:{ preset:'rise', duration:700, delay:240 } },

    /* gallery */
    { id:nid(), type:'text', x:60, y:1170, w:600, h:40, z:2,
      content:{ text:'· บันทึกในเฟรม', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.18em', align:'left' } },
    { id:nid(), type:'image', x:60, y:1230, w:280, h:280, z:2,
      content:{ shape:'rect', slot:'pf-g1', placeholder:'beach · film' }, styles:{ radius:18 } },
    { id:nid(), type:'image', x:360, y:1230, w:280, h:280, z:2,
      content:{ shape:'circle', slot:'pf-g2', placeholder:'ceramic mug' } },
    { id:nid(), type:'image', x:660, y:1230, w:280, h:380, z:2,
      content:{ shape:'arch', slot:'pf-g3', placeholder:'old market' } },
    { id:nid(), type:'image', x:960, y:1230, w:180, h:180, z:2,
      content:{ shape:'star', slot:'pf-g4', placeholder:'sparkle' } },
    { id:nid(), type:'sticker', x:960, y:1430, w:180, h:80, z:3, rot:-6,
      content:{ key:'arrow' } },

    /* contact */
    { id:nid(), type:'shape', x:0, y:1580, w:1200, h:160, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#0d8a7e', radius:0 } },
    { id:nid(), type:'contact', x:60, y:1620, w:520, h:80, z:2,
      content:{ kind:'panel' }, styles:{ color:'#fff' } },
    { id:nid(), type:'link', x:880, y:1630, w:240, h:60, z:2,
      content:{ text:'จองเซสชันกับฉัน →', icon:'mail' },
      link:{ href:'#contact', target:'_self' },
      styles:{ fill:'#f5c243', color:'#0d1e1d', radius:999, fontSize:16, fontWeight:600, align:'center' },
      animation:{ preset:'magnetic' } },
  ];
}

export function tplStaff() {
  return [
    { id:nid(), type:'shape', x:0, y:0, w:1200, h:560, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#f6f1e6', radius:0 } },
    { id:nid(), type:'image', x:80, y:80, w:380, h:400, z:2,
      content:{ shape:'arch', slot:'staff-portrait', placeholder:'staff portrait' },
      animation:{ preset:'fade-in', duration:800 } },
    { id:nid(), type:'sticker', x:60, y:60, w:80, h:80, z:3,
      content:{ key:'star4' } },
    { id:nid(), type:'text', x:520, y:110, w:600, h:30, z:3,
      content:{ text:'· soul silent · team', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.18em', align:'left' } },
    { id:nid(), type:'text', x:520, y:150, w:620, h:120, z:3,
      content:{ text:'Pim Sornsuwan', tag:'h1' },
      styles:{ fontFamily:'Mitr', fontSize:64, fontWeight:500, color:'#0d1e1d', align:'left', lineHeight:1 },
      animation:{ preset:'rise' } },
    { id:nid(), type:'text', x:520, y:240, w:200, h:40, z:3,
      content:{ text:'workshop curator', tag:'p' },
      styles:{ fontFamily:'Caveat', fontSize:32, color:'#0d8a7e', align:'left' } },
    { id:nid(), type:'text', x:520, y:300, w:600, h:160, z:3,
      content:{ text:'ดูแลโปรแกรมการเรียนรู้ของ soul silent · เชื่อว่าห้องเรียนที่ดีที่สุดมักจะอยู่นอกห้องเรียน และความเงียบเป็นภาษาที่ทุกคนเข้าใจร่วมกัน', tag:'p' },
      styles:{ fontFamily:'IBM Plex Sans Thai', fontSize:17, color:'#1a2e2c', align:'left', lineHeight:1.7 } },
    { id:nid(), type:'sticker', x:1040, y:440, w:120, h:120, z:3, rot:12,
      content:{ key:'spiral' } },

    { id:nid(), type:'text', x:80, y:620, w:600, h:40, z:2,
      content:{ text:'· เวิร์กชอปที่ดูแลอยู่', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.18em', align:'left' } },
    { id:nid(), type:'credential', x:80, y:670, w:340, h:170, z:2,
      content:{ credId:'c1' }, animation:{ preset:'rise' } },
    { id:nid(), type:'credential', x:440, y:670, w:340, h:170, z:2,
      content:{ credId:'c2' }, animation:{ preset:'rise', delay:120 } },
    { id:nid(), type:'credential', x:800, y:670, w:340, h:170, z:2,
      content:{ credId:'c3' }, animation:{ preset:'rise', delay:240 } },

    { id:nid(), type:'contact', x:80, y:900, w:520, h:140, z:2,
      content:{ kind:'panel' } },
    { id:nid(), type:'link', x:880, y:940, w:240, h:60, z:2,
      content:{ text:'นัดคุยสั้น ๆ →', icon:'mail' },
      link:{ href:'#contact' },
      styles:{ fill:'#0d1e1d', color:'#fff', radius:999, fontSize:16, fontWeight:600, align:'center' },
      animation:{ preset:'magnetic' } },
  ];
}

export function tplOrganizer() {
  return [
    /* big poster hero */
    { id:nid(), type:'shape', x:0, y:0, w:1200, h:720, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#0d8a7e', radius:0 } },
    { id:nid(), type:'image', x:0, y:0, w:1200, h:720, z:2,
      content:{ shape:'rect', slot:'org-cover', placeholder:'hero cover · full bleed' }, styles:{ opacity:.6 } },
    { id:nid(), type:'shape', x:0, y:420, w:1200, h:300, z:3,
      content:{ shape:'rect' }, styles:{ fill:'linear-gradient(180deg, transparent, rgba(13,30,29,.85))', radius:0 } },

    { id:nid(), type:'text', x:60, y:480, w:300, h:30, z:4,
      content:{ text:'· organizer · 2026', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:13, color:'#f5c243', letterSpacing:'.2em', align:'left' } },
    { id:nid(), type:'text', x:60, y:520, w:1080, h:160, z:4,
      content:{ text:'STUDIO\nNORTH OF QUIET', tag:'h1' },
      styles:{ fontFamily:'Archivo Black', fontSize:108, color:'#fff', align:'left', lineHeight:.9, letterSpacing:'-.02em' },
      animation:{ preset:'rise', duration:900 } },

    /* manifesto */
    { id:nid(), type:'text', x:60, y:780, w:600, h:40, z:2,
      content:{ text:'· manifesto', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.2em', align:'left' } },
    { id:nid(), type:'text', x:60, y:820, w:560, h:300, z:2,
      content:{ text:'เราเชื่อในห้องเรียนกลางแจ้ง · ในตลาดเก่า ในเช้าที่ฝนเพิ่งหยุด · ทุกเวิร์กชอปของเราออกแบบมาเพื่อทำให้ "ความสนใจ" กลับมาเป็นสมบัติของคุณอีกครั้ง', tag:'p' },
      styles:{ fontFamily:'Mitr', fontSize:30, fontWeight:400, color:'#0d1e1d', align:'left', lineHeight:1.35 } },

    { id:nid(), type:'sticker', x:700, y:820, w:200, h:200, z:3, rot:-8,
      content:{ key:'sun' }, animation:{ preset:'float' } },
    { id:nid(), type:'sticker', x:920, y:900, w:240, h:120, z:3,
      content:{ key:'underline' } },

    { id:nid(), type:'text', x:60, y:1180, w:600, h:40, z:2,
      content:{ text:'· programs', tag:'eyebrow' },
      styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.2em', align:'left' } },
    { id:nid(), type:'credential', x:60, y:1230, w:360, h:200, z:2,
      content:{ credId:'c2' } },
    { id:nid(), type:'credential', x:440, y:1230, w:360, h:200, z:2,
      content:{ credId:'c1' } },
    { id:nid(), type:'credential', x:820, y:1230, w:320, h:200, z:2,
      content:{ credId:'c3' } },

    { id:nid(), type:'shape', x:0, y:1480, w:1200, h:220, z:1,
      content:{ shape:'rect' }, styles:{ fill:'#0d1e1d', radius:0 } },
    { id:nid(), type:'contact', x:60, y:1540, w:520, h:100, z:2,
      content:{ kind:'panel' }, styles:{ color:'#fff' } },
    { id:nid(), type:'link', x:840, y:1550, w:280, h:70, z:2,
      content:{ text:'จองสตูดิโอนี้ →' },
      link:{ href:'#book' },
      styles:{ fill:'#f5c243', color:'#0d1e1d', radius:999, fontSize:17, fontWeight:600, align:'center' },
      animation:{ preset:'magnetic' } },
  ];
}

export const TEMPLATES = {
  empty:       { th:'เปล่า',       en:'Empty canvas',  build: tplEmpty,       canvasH: CANVAS_H_MIN },
  participant: { th:'ผู้เข้าร่วม', en:'Participant',   build: tplParticipant, canvasH: 1760 },
  staff:       { th:'ทีม SoulSilent', en:'SoulSilent staff', build: tplStaff, canvasH: 1080 },
  organizer:   { th:'ผู้จัดเวิร์กชอป', en:'Workshop organizer', build: tplOrganizer, canvasH: 1720 },
};

export const PALETTE = [
  { group:{th:'ตัวอักษร', en:'Text'}, items:[
    { kind:'text', sub:'h1',      th:'หัวเรื่องใหญ่',  en:'Display heading',
      preset:{ w:520, h:90,  content:{ text:'หัวเรื่องของคุณ', tag:'h1' },
               styles:{ fontFamily:'Mitr', fontSize:54, fontWeight:500, color:'#0d1e1d', align:'left', lineHeight:1.05 } } },
    { kind:'text', sub:'h2',      th:'หัวเรื่องย่อย',  en:'Subheading',
      preset:{ w:420, h:60,  content:{ text:'หัวเรื่องย่อย', tag:'h2' },
               styles:{ fontFamily:'Mitr', fontSize:32, fontWeight:500, color:'#0d1e1d', align:'left', lineHeight:1.1 } } },
    { kind:'text', sub:'body',    th:'ข้อความ',       en:'Body text',
      preset:{ w:380, h:120, content:{ text:'เริ่มเล่าเรื่องของคุณตรงนี้…', tag:'p' },
               styles:{ fontFamily:'IBM Plex Sans Thai', fontSize:17, color:'#1a2e2c', align:'left', lineHeight:1.65 } } },
    { kind:'text', sub:'eyebrow', th:'อีโบรว์',       en:'Eyebrow',
      preset:{ w:240, h:24,  content:{ text:'· section · 01', tag:'eyebrow' },
               styles:{ fontFamily:'JetBrains Mono', fontSize:12, color:'#0d8a7e', letterSpacing:'.2em', align:'left' } } },
    { kind:'text', sub:'hand',    th:'ลายมือ',        en:'Handwritten',
      preset:{ w:280, h:50,  content:{ text:'a note from me', tag:'p' },
               styles:{ fontFamily:'Caveat', fontSize:32, color:'#d35d52', align:'left' } } },
  ]},
  { group:{th:'ภาพ', en:'Image'}, items:[
    { kind:'image', sub:'rect',   th:'ภาพสี่เหลี่ยม', en:'Image (rect)',
      preset:{ w:280, h:280, content:{ shape:'rect', slot:'', placeholder:'photo' }, styles:{ radius:18 } } },
    { kind:'image', sub:'circle', th:'ภาพวงกลม',    en:'Image (circle)',
      preset:{ w:240, h:240, content:{ shape:'circle', slot:'', placeholder:'portrait' } } },
    { kind:'image', sub:'arch',   th:'ภาพซุ้มโค้ง',  en:'Image (arch)',
      preset:{ w:240, h:340, content:{ shape:'arch', slot:'', placeholder:'arch crop' } } },
    { kind:'image', sub:'blob',   th:'ภาพรูปบลอบ',   en:'Image (blob)',
      preset:{ w:280, h:280, content:{ shape:'blob', slot:'', placeholder:'organic mask' } } },
    { kind:'image', sub:'star',   th:'ภาพรูปดาว',    en:'Image (star)',
      preset:{ w:220, h:220, content:{ shape:'star', slot:'', placeholder:'star crop' } } },
  ]},
  { group:{th:'รูปร่าง', en:'Shapes'}, items:[
    { kind:'shape', sub:'rect',    th:'สี่เหลี่ยม', en:'Rectangle',
      preset:{ w:280, h:160, content:{ shape:'rect' }, styles:{ fill:'#f6f1e6', radius:18 } } },
    { kind:'shape', sub:'circle',  th:'วงกลม',     en:'Circle',
      preset:{ w:220, h:220, content:{ shape:'circle' }, styles:{ fill:'#a5d9d1' } } },
    { kind:'shape', sub:'blob',    th:'บลอบ',      en:'Blob',
      preset:{ w:300, h:280, content:{ shape:'blob' }, styles:{ fill:'#f5c243' } } },
    { kind:'shape', sub:'star',    th:'ดาว',       en:'Star',
      preset:{ w:200, h:200, content:{ shape:'star' }, styles:{ fill:'#f5c243' } } },
    { kind:'shape', sub:'arch',    th:'ซุ้มโค้ง',   en:'Arch',
      preset:{ w:240, h:300, content:{ shape:'arch' }, styles:{ fill:'#0d8a7e' } } },
    { kind:'shape', sub:'diamond', th:'ข้าวหลามตัด', en:'Diamond',
      preset:{ w:220, h:220, content:{ shape:'diamond' }, styles:{ fill:'#d35d52' } } },
  ]},
  { group:{th:'ลิงก์ & การติดต่อ', en:'Link & contact'}, items:[
    { kind:'link', sub:'btn-primary', th:'ปุ่ม',     en:'Button',
      preset:{ w:220, h:54, content:{ text:'กดที่นี่ →' }, link:{ href:'https://', target:'_blank' },
               styles:{ fill:'#0d1e1d', color:'#fff', radius:999, fontSize:16, fontWeight:600, align:'center' } } },
    { kind:'link', sub:'btn-pill',  th:'ปุ่ม Pill',  en:'Pill button',
      preset:{ w:200, h:48, content:{ text:'Read more' }, link:{ href:'#' },
               styles:{ fill:'#f5c243', color:'#0d1e1d', radius:999, fontSize:15, fontWeight:600, align:'center' } } },
    { kind:'contact', sub:'panel', th:'การ์ดติดต่อ', en:'Contact card',
      preset:{ w:520, h:130, content:{ kind:'panel' } } },
    { kind:'credential', sub:'badge', th:'เหรียญรับรองเวิร์กชอป', en:'Workshop credential',
      preset:{ w:340, h:170, content:{ credId:'c2' } } },
  ]},
  { group:{th:'มีเดีย', en:'Media'}, items:[
    { kind:'embed', sub:'youtube', th:'วิดีโอ YouTube', en:'YouTube',
      preset:{ w:480, h:280, content:{ provider:'youtube', url:'https://youtu.be/dQw4w9WgXcQ' }, styles:{ radius:18 } } },
    { kind:'embed', sub:'spotify', th:'Spotify',       en:'Spotify',
      preset:{ w:380, h:160, content:{ provider:'spotify', url:'spotify:track:...' }, styles:{ radius:18 } } },
    { kind:'embed', sub:'audio',   th:'เสียง',         en:'Audio',
      preset:{ w:360, h:80,  content:{ provider:'audio',   url:'audio.mp3' }, styles:{ radius:14 } } },
  ]},
];

/** A fresh portfolio document from a template key. */
export function defaultDoc(tpl = 'participant'): PortfolioDoc {
  const t = (TEMPLATES as Record<string, { build: () => PNode[]; canvasH: number }>)[tpl] || TEMPLATES.participant;
  return {
    id: 'pf_' + Date.now().toString(36),
    owner: 'My portfolio',
    title: { th: 'Portfolio ของฉัน', en: 'My portfolio' },
    subtitle: { th: 'พื้นที่บันทึกความเงียบและการเรียนรู้', en: 'A space for silence and learning' },
    visibility: 'private',
    slug: 'me',
    template: tpl,
    canvasH: t.canvasH,
    canvasBg: 'paper',
    nodes: (t.build() as PNode[]),
    updatedAt: new Date().toISOString(),
  };
}

export const STICKER_MAP: Record<string, { key: string; th: string; en: string; svg: string }> =
  Object.fromEntries(STICKERS.map((s) => [s.key, s]));
export const CRED_MAP: Record<string, (typeof SAMPLE_CREDENTIALS)[number]> =
  Object.fromEntries(SAMPLE_CREDENTIALS.map((c) => [c.id, c]));
