import type { Card } from '@/lib/line-flex';

/**
 * One example of every LINE card, with made-up details — the same set as
 * the "LINE Flex Messages v2" design. Admin can have them all sent to their
 * own LINE (api/admin/line-samples) to see the real thing.
 */
const J = 'Slow Sketch Morning';
const D = 'ส. 14 พ.ย.';
const TM = '10:00 น.';
const L = 'บ้านไม้ริมคลอง';

export const LINE_SAMPLES: { name: string; card: Card }[] = [
  { name: 'จองสำเร็จ', card: { topic: 'booking', hero: { kind: 'poster', image: '/icons/icon-512.png' }, title: 'จองสำเร็จแล้ว', sub: J, rows: [{ k: 'วัน', v: D }, { k: 'เวลา', v: TM }, { k: 'ที่', v: L }], cta: { label: 'ดูตั๋วของฉัน', url: '/me/bookings' } } },
  { name: 'เตือนคืนก่อน', card: { topic: 'reminder', hero: { kind: 'tomorrow', time: '10:00' }, title: `พรุ่งนี้ ${J}`, sub: `ที่ ${L} · มาก่อนเวลาสัก 10 นาที`, cta: { label: 'ดูตั๋วและแผนที่', url: '/me/bookings' } } },
  { name: 'เตือน 2 ชั่วโมงก่อน', card: { topic: 'reminder', hero: { kind: 'soon' }, title: `อีกไม่นาน: ${J}`, sub: `เริ่ม ${TM} · ที่ ${L}`, cta: { label: 'เปิด QR เช็คอิน', url: '/me/bookings' } } },
  { name: 'เพื่อนเข้ากลุ่ม', card: { topic: 'booking', title: 'เพื่อนเข้ากลุ่มแล้ว', sub: `ปอ รับคำเชิญ ${J}`, avatars: { list: ['คุณ', 'ป', '+1'], note: 'ไปด้วยกัน 2 จาก 3 ที่' }, cta: { label: 'ดูกลุ่มของฉัน', url: '/me/bookings' } } },
  {
    name: 'ผู้จัดเปลี่ยนรายละเอียด',
    card: { topic: 'change', title: `เปลี่ยนแปลง: ${J}`, sub: 'ผู้จัดปรับวันเวลาและสถานที่ของรอบนี้', rows: [{ k: 'วันเวลา', old: `${D} ${TM}`, v: 'ส. 21 พ.ย. 13:00 น.' }, { k: 'สถานที่', old: L, v: 'สตูดิโอชั้น 2' }], cta: { label: 'ดูการจอง', url: '/me/bookings' } },
  },
  {
    name: 'ผู้จัดย้ายรอบ',
    card: {
      topic: 'change', title: `ย้ายรอบ: ${J}`, sub: 'ผู้จัดย้ายที่นั่งของคุณไปรอบใหม่',
      rows: [{ k: 'รอบเดิม', v: `${D} ${TM}`, color: '#9aaba8' }, { k: 'รอบใหม่', v: 'ส. 21 พ.ย. 10:00 น.' }],
      cta: { label: 'ยืนยันรอบใหม่', url: '/me/bookings' },
    },
  },
  { name: 'รอบถูกยกเลิก', card: { topic: 'cancel', title: `ยกเลิก: ${J}`, sub: 'ขออภัย รอบนี้ถูกยกเลิก การคืนเงินเป็นไปตามนโยบาย', rows: [{ k: 'รอบ', v: `${D} ${TM}`, color: '#a3261a' }], cta: { label: 'ดูการจองและการคืนเงิน', url: '/me/bookings', dark: true } } },
  { name: 'ผ่านการคัดเลือก', card: { topic: 'select', hero: { kind: 'selected' }, title: 'ยินดีด้วย คุณผ่านการคัดเลือก', sub: J, rows: [{ k: 'ยืนยันภายใน', v: 'จ. 9 พ.ย. 23:59 น.', color: '#1f5fae' }], cta: { label: 'ยืนยันสิทธิ์', url: '/me/bookings' } } },
  { name: 'รายชื่อสำรอง', card: { topic: 'select', title: 'คุณอยู่ในรายชื่อสำรอง', sub: `${J}\nถ้ามีที่ว่าง เราจะแจ้งให้ทราบทันที`, cta: { label: 'ดูการจอง', url: '/me/bookings', dark: true } } },
  { name: 'ไม่ผ่านการคัดเลือก', card: { topic: 'select', title: 'ครั้งนี้ยังไม่ได้รับเลือก', sub: `ขอบคุณที่สนใจ ${J} — ลองดูกิจกรรมอื่นที่ใกล้เคียงได้เลย`, cta: { label: 'ดูกิจกรรมอื่น', url: '/journeys', dark: true } } },
  { name: 'ได้รับของขวัญ', card: { topic: 'gift', hero: { kind: 'gift' }, title: 'มีคนให้ที่นั่งเป็นของขวัญ', sub: `${J} · ${D}`, cta: { label: 'เปิดของขวัญ', url: '/me/bookings' } } },
  { name: 'ได้รับสิทธิ์ต่อ', card: { topic: 'gift', title: 'ได้รับสิทธิ์เข้าร่วมแล้ว', sub: `${J} · ${D}`, cta: { label: 'ดูตั๋วของฉัน', url: '/me/bookings' } } },
  { name: 'ของขวัญถูกรับ', card: { topic: 'gift', title: 'มายด์ รับที่นั่งแล้ว', sub: `ของขวัญ ${J} ถึงมือแล้ว`, cta: { label: 'ดูการจอง', url: '/me/bookings', dark: true } } },
  {
    name: 'ชวนตอบแบบสอบถาม',
    card: { topic: 'voice', title: 'วันนี้เป็นอย่างไรบ้าง', sub: `เล่าความรู้สึกหลัง ${J} ไม่ถึง 1 นาที — ผู้จัดจะได้ทำครั้งหน้าให้ดีขึ้น`, stars: { n: 0, ask: true, hint: 'แตะดาวเพื่อให้คะแนน', url: '/journeys' }, cta: { label: 'ตอบแบบสอบถาม', url: '/journeys' } },
  },
  { name: 'ได้รับคูปอง', card: { topic: 'gift', hero: { kind: 'coupon', discount: '−฿200' }, title: 'คุณได้รับคูปอง', sub: 'คูปองต้อนรับ · ใช้ได้กับทุกกิจกรรม', cta: { label: 'ดูคูปองของฉัน', url: '/me/coupons' } } },
  { name: 'มีคนจองรอบ', card: { topic: 'host', title: 'มีคนจองรอบของคุณ', sub: `มายด์ จอง 2 ที่ · ${J}\n${D} ${TM}`, meter: { taken: 8, cap: 12 }, cta: { label: 'ดูผู้เข้าร่วม', url: '/host', dark: true } } },
  { name: 'มีใบสมัครใหม่', card: { topic: 'host', title: 'มีใบสมัครใหม่', sub: `มายด์ สมัคร ${J} · ${D}`, avatars: { list: ['ม'], note: 'รอคัดเลือก 5 คน' }, cta: { label: 'อ่านใบสมัคร', url: '/host', dark: true } } },
  { name: 'ขอคืนเงิน', card: { topic: 'cancel', topicLabel: 'ขอคืนเงิน', title: 'มีคนขอคืนเงิน', sub: `มายด์ ขอคืนเงินแทนการย้ายรอบ\n${J} · ${D}`, cta: { label: 'ดูรายละเอียด', url: '/host', dark: true } } },
  { name: 'รีวิว 1–2 ดาว', card: { topic: 'voice', title: `รีวิวใหม่ · ${J}`, stars: { n: 2 }, quote: 'เสียงในห้องดังไปหน่อย อยากให้มีช่วงเงียบมากกว่านี้', cta: { label: 'ดูรีวิว', url: '/host/reviews', dark: true } } },
  {
    name: 'แอดมิน: รอบถูกยกเลิก',
    card: { topic: 'admin', band: { text: 'ADMIN · ตรวจการคืนเงิน', dot: '#d94b46' }, title: `รอบถูกยกเลิก: ${J}`, rows: [{ k: 'รอบ', v: `${D} ${TM}` }, { k: 'ผู้จอง', v: '6 คน' }], cta: { label: 'เปิดการแจ้งเตือน', url: '/admin/insights?tab=alerts', dark: true } },
  },
  {
    name: 'แอดมิน: รอบถูกเปลี่ยน',
    card: { topic: 'admin', band: { text: 'ADMIN · รอบเปลี่ยน', dot: '#ee7c2a' }, title: `รอบถูกเลื่อน: ${J}`, rows: [{ k: 'วันเวลา', old: `${D} ${TM}`, v: 'ส. 21 พ.ย. 13:00 น.' }, { k: 'ผู้จอง', v: '6 คน' }], cta: { label: 'เปิดรายการกิจกรรม', url: '/admin/workshops', dark: true } },
  },
  {
    name: 'แอดมิน: แจ้งเตือนด่วน',
    card: {
      topic: 'admin', band: { text: 'ADMIN · ด่วน', dot: '#d94b46' }, title: 'แจ้งเตือนด่วน 5 เรื่อง',
      bullets: { list: [{ t: `ค้างโอนผู้จัด · ${J}`, d: 'ครูมายด์ · ฿4,800 · จบมา 9 วัน' }, { t: 'เงินเข้าผิดปกติ', d: 'ไม่พบการจองที่ตรงกัน' }, { t: `รอบถูกยกเลิก · ${J}`, d: '6 การจอง' }], more: 'และอีก 2 เรื่อง' },
      cta: { label: 'เปิดศูนย์แจ้งเตือน', url: '/admin/insights?tab=alerts', dark: true },
    },
  },
  { name: 'เชื่อม LINE สำเร็จ', card: { topic: 'system', hero: { kind: 'linked' }, title: 'เชื่อม LINE สำเร็จ', sub: 'จากนี้การแจ้งเตือนของ AllSoulLearn จะส่งมาที่นี่', cta: { label: 'ตั้งค่าการแจ้งเตือน', url: '/me/settings?tab=notify' } } },
];
