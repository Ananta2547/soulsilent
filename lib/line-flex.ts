/**
 * LINE notification cards ("LINE Flex Messages v2", Claude Design project
 * 226f25ce). Every card opens with a topic pill in one colour set shared by
 * the whole system; the bigger moments get a hero on top, small ones are
 * text only. Heroes are drawn with Flex boxes (no image hosting needed) —
 * the design's motion is not possible in Flex, so they are still.
 *
 * lib/line.ts sends `flexCard(payload.card ?? a plain card)`; the cron and
 * the event senders fill `card` with what the notice is about.
 */

export type Topic = 'booking' | 'reminder' | 'change' | 'cancel' | 'select' | 'gift' | 'voice' | 'host' | 'admin' | 'system';

export const TOPICS: Record<Topic, { label: string; bg: string; fg: string; dot: string }> = {
  booking: { label: 'การจอง', bg: '#eaf6f4', fg: '#075a51', dot: '#0d8a7e' },
  reminder: { label: 'เตือนความจำ', bg: '#fdf1d3', fg: '#7a5200', dot: '#f5c243' },
  change: { label: 'มีการเปลี่ยนแปลง', bg: '#fde7d3', fg: '#a04a14', dot: '#ee7c2a' },
  cancel: { label: 'ยกเลิก', bg: '#fde4e1', fg: '#a3261a', dot: '#d94b46' },
  select: { label: 'ผลการคัดเลือก', bg: '#e3eefc', fg: '#1f5fae', dot: '#1f5fae' },
  gift: { label: 'ที่นั่ง & ของขวัญ', bg: '#fce4a0', fg: '#7e5c14', dot: '#d9a832' },
  voice: { label: 'เสียงผู้เข้าร่วม', bg: '#ede5cf', fg: '#5c4f2c', dot: '#9a8a5c' },
  host: { label: 'ผู้จัด', bg: '#0d1e1d', fg: '#ffffff', dot: '#16a99a' },
  admin: { label: 'ทีมงาน', bg: '#eceeed', fg: '#4c5755', dot: '#4c5755' },
  system: { label: 'บัญชี', bg: '#eaf6f4', fg: '#075a51', dot: '#0d8a7e' },
};

export type Hero =
  | { kind: 'poster'; image: string } // the activity's cover with "✓ ที่นั่งของคุณ"
  | { kind: 'tomorrow'; time: string } // "10:00"
  | { kind: 'soon' }
  | { kind: 'selected' }
  | { kind: 'gift' }
  | { kind: 'coupon'; discount: string } // "−฿200"
  | { kind: 'linked' };

export type CardRow = { k: string; v: string; old?: string; color?: string };

export type Card = {
  topic: Topic;
  /** Replaces the topic's label (same colours), e.g. "ขอคืนเงิน". */
  topicLabel?: string;
  hero?: Hero;
  /** Dark strip under the hero, for admin notices: "ADMIN · ด่วน". */
  band?: { text: string; dot: string };
  title: string;
  sub?: string;
  rows?: CardRow[];
  meter?: { taken: number; cap: number };
  avatars?: { list: string[]; note: string };
  stars?: { n: number; ask?: boolean; hint?: string };
  quote?: string;
  bullets?: { list: { t: string; d: string }[]; more?: string };
  cta: { label: string; url?: string; dark?: boolean };
  cta2?: { label: string; url?: string };
};

const INK = '#0d1e1d';
const MUTED = '#6a7a78';
const FAINT = '#9aaba8';
const TEAL = '#0d8a7e';
const SEP = '#eef0ef';
export const RED = '#a3261a';
export const BLUE = '#1f5fae';
const AV = [
  { bg: TEAL, fg: '#ffffff' },
  { bg: '#f5c243', fg: INK },
  { bg: '#ede5cf', fg: MUTED },
];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
type Obj = Record<string, unknown>;
const text = (t: string, o: Obj = {}): Obj => ({ type: 'text', text: t || ' ', wrap: true, ...o });
const box = (layout: 'vertical' | 'horizontal' | 'baseline', contents: unknown[], o: Obj = {}): Obj => ({ type: 'box', layout, contents, ...o });
const dot = (color: string, size = '7px') => box('vertical', [], { width: size, height: size, cornerRadius: '50px', backgroundColor: color, flex: 0 });
/** A block under the title, set off by a hairline. */
const section = (contents: unknown[]) => box('vertical', [{ type: 'separator', color: SEP }, ...contents], { spacing: 'sm', paddingTop: 'md' });
const circle = (size: string, bg: string, inner: Obj, o: Obj = {}) => box('vertical', [inner], { width: size, height: size, cornerRadius: '50px', backgroundColor: bg, justifyContent: 'center', alignItems: 'center', flex: 0, ...o });

function heroOf(h: Hero, siteUrl: string): Obj {
  switch (h.kind) {
    case 'poster':
      return box(
        'vertical',
        [
          { type: 'image', url: new URL(h.image, siteUrl).toString(), size: 'full', aspectRatio: '20:13', aspectMode: 'cover' },
          box('horizontal', [circle('16px', TEAL, text('✓', { size: 'xxs', color: '#ffffff', align: 'center' })), text('ที่นั่งของคุณ', { size: 'xs', weight: 'bold', color: '#ffffff', flex: 0, wrap: false })], {
            position: 'absolute', offsetStart: '14px', offsetBottom: '14px', backgroundColor: INK, cornerRadius: '50px',
            paddingTop: '6px', paddingBottom: '6px', paddingStart: '10px', paddingEnd: '12px', spacing: 'sm', alignItems: 'center',
          }),
        ],
        { paddingAll: '0px' },
      );
    case 'tomorrow':
      return box(
        'vertical',
        [
          // A crescent moon: a yellow disc with a dark one laid over it.
          box('vertical', [], { position: 'absolute', offsetTop: '22px', offsetEnd: '26px', width: '46px', height: '46px', cornerRadius: '50px', backgroundColor: '#f5c243' }),
          box('vertical', [], { position: 'absolute', offsetTop: '16px', offsetEnd: '18px', width: '42px', height: '42px', cornerRadius: '50px', backgroundColor: INK }),
          text('✺', { position: 'absolute', offsetTop: '30px', offsetEnd: '86px', size: 'sm', color: '#a5d9d1' }),
          text('TOMORROW', { size: 'xxs', weight: 'bold', color: '#a5d9d1' }),
          text(h.time, { size: '54px', weight: 'bold', color: '#ffffff', wrap: false }),
        ],
        { height: '150px', backgroundColor: INK, paddingAll: '20px', justifyContent: 'flex-end' },
      );
    case 'soon':
      return box(
        'horizontal',
        [
          circle('88px', '#075a51', text('2H', { size: 'xxl', weight: 'bold', color: '#ffffff', align: 'center' }), { borderWidth: '8px', borderColor: '#f5c243' }),
          box('vertical', [text('STARTS', { size: '30px', weight: 'bold', color: '#ffffff', wrap: false }), text('SOON', { size: '30px', weight: 'bold', color: '#ffffff', wrap: false })], { justifyContent: 'center' }),
        ],
        { height: '150px', backgroundColor: TEAL, paddingAll: '22px', spacing: 'lg', alignItems: 'center' },
      );
    case 'selected':
      return box(
        'vertical',
        [
          circle('34px', TEAL, text('✓', { size: 'md', weight: 'bold', color: '#ffffff', align: 'center' }), { position: 'absolute', offsetTop: '20px', offsetEnd: '22px' }),
          text('SELECTED', { size: '40px', weight: 'bold', color: '#075a51', align: 'center', wrap: false }),
          box('vertical', [], { height: '10px', width: '200px', cornerRadius: '10px', backgroundColor: '#f5c243' }),
        ],
        { height: '150px', backgroundColor: '#eaf6f4', justifyContent: 'center', alignItems: 'center', spacing: 'xs' },
      );
    case 'gift':
      return box('vertical', [text('A GIFT', { size: '30px', weight: 'bold', color: INK, wrap: false }), text('FOR YOU', { size: '30px', weight: 'bold', color: INK, wrap: false })], {
        height: '150px', backgroundColor: '#fce4a0', paddingAll: '24px', justifyContent: 'center',
      });
    case 'coupon':
      return box('vertical', [text('COUPON', { size: 'xxs', weight: 'bold', color: '#7e5c14' }), text(h.discount, { size: '56px', weight: 'bold', color: INK, wrap: false })], {
        height: '150px', backgroundColor: '#fce4a0', paddingAll: '26px', justifyContent: 'center',
      });
    case 'linked':
      return box(
        'vertical',
        [
          circle('56px', '#f6f1e6', { type: 'image', url: `${siteUrl}/icons/icon-192.png`, size: '30px', aspectMode: 'fit' }, { borderWidth: '4px', borderColor: '#16a99a' }),
          text('CONNECTED', { size: 'xxs', weight: 'bold', color: '#a5d9d1', align: 'center' }),
        ],
        { height: '150px', backgroundColor: INK, justifyContent: 'center', alignItems: 'center', spacing: 'md' },
      );
  }
}

/** One notification as a Flex message. */
export function flexCard(c: Card, siteUrl: string, altText: string) {
  const abs = (u?: string) => (u ? new URL(u, siteUrl).toString() : siteUrl);
  const tp = TOPICS[c.topic];
  const body: unknown[] = [
    box(
      'horizontal',
      [
        box('horizontal', [dot(tp.dot), text(c.topicLabel || tp.label, { size: 'xs', weight: 'bold', color: tp.fg, wrap: false, flex: 0 })], {
          backgroundColor: tp.bg, cornerRadius: '50px', paddingTop: '4px', paddingBottom: '4px', paddingStart: '8px', paddingEnd: '10px', spacing: 'sm', alignItems: 'center', flex: 0,
        }),
        box('vertical', [], { flex: 1 }),
        text('AllSoulLearn', { size: 'xxs', weight: 'bold', color: FAINT, flex: 0, wrap: false }),
      ],
      { alignItems: 'center' },
    ),
    box('vertical', [text(clip(c.title, 200), { size: 'lg', weight: 'bold', color: INK }), ...(c.sub ? [text(clip(c.sub, 600), { size: 'sm', color: MUTED })] : [])], { spacing: 'xs' }),
  ];

  if (c.rows?.length) {
    body.push(
      section(
        c.rows.map((r) =>
          box(
            'horizontal',
            [
              box('vertical', [text(r.k, { size: 'sm', color: FAINT })], { width: '64px', flex: 0 }),
              box('vertical', [...(r.old ? [text(r.old, { size: 'sm', color: FAINT, decoration: 'line-through' })] : []), text(r.v, { size: 'sm', weight: 'bold', color: r.color || INK })]),
            ],
            { spacing: 'md' },
          ),
        ),
      ),
    );
  }
  if (c.meter && c.meter.cap > 0) {
    const pct = Math.max(2, Math.min(100, Math.round((c.meter.taken / c.meter.cap) * 100)));
    body.push(
      section([
        box('horizontal', [text('ที่นั่งที่จองแล้ว', { size: 'xs', color: FAINT }), text(`${c.meter.taken}/${c.meter.cap}`, { size: 'xs', weight: 'bold', color: INK, align: 'end' })]),
        box('vertical', [box('vertical', [], { width: `${pct}%`, height: '6px', backgroundColor: TEAL, cornerRadius: '3px' })], { height: '6px', backgroundColor: '#ede5cf', cornerRadius: '3px' }),
      ]),
    );
  }
  if (c.avatars?.list.length) {
    body.push(
      section([
        box(
          'horizontal',
          [
            ...c.avatars.list.slice(0, 4).map((t, i) => circle('30px', AV[i % 3].bg, text(t, { size: 'xs', weight: 'bold', color: AV[i % 3].fg, align: 'center', wrap: false }))),
            text(c.avatars.note, { size: 'xs', color: MUTED, margin: 'md' }),
          ],
          { spacing: 'xs', alignItems: 'center' },
        ),
      ]),
    );
  }
  if (c.stars) {
    const s = c.stars;
    body.push(
      section([
        box(
          'horizontal',
          [1, 2, 3, 4, 5].map((i) => {
            const on = !s.ask && i <= s.n;
            return box('vertical', [text('★', { size: 'lg', color: s.ask ? '#c9bf9f' : on ? '#d9a832' : '#d8cfb3', align: 'center' })], {
              height: '40px', cornerRadius: '10px', backgroundColor: on ? '#fdf1d3' : '#f6f1e6', justifyContent: 'center',
            });
          }),
          { spacing: 'sm' },
        ),
        ...(s.hint ? [text(s.hint, { size: 'xxs', color: FAINT, align: 'center' })] : []),
      ]),
    );
  }
  if (c.quote) {
    body.push(box('vertical', [text(`“${clip(c.quote, 300)}”`, { size: 'sm', color: INK })], { backgroundColor: '#f6f1e6', cornerRadius: '12px', paddingAll: '12px' }));
  }
  if (c.bullets?.list.length) {
    body.push(
      box('vertical', [
        ...c.bullets.list.slice(0, 3).map((b) =>
          box('vertical', [
            { type: 'separator', color: SEP },
            box('horizontal', [box('vertical', [dot('#d94b46')], { flex: 0, paddingTop: '6px' }), box('vertical', [text(clip(b.t, 120), { size: 'sm', weight: 'bold', color: INK }), text(clip(b.d, 160), { size: 'xs', color: MUTED })])], {
              spacing: 'md', paddingTop: '9px', paddingBottom: '9px',
            }),
          ]),
        ),
        ...(c.bullets.more ? [{ type: 'separator', color: SEP }, text(c.bullets.more, { size: 'xs', color: MUTED, margin: 'sm' })] : []),
      ]),
    );
  }

  const footer: unknown[] = [{ type: 'button', style: 'primary', color: c.cta.dark ? INK : TEAL, height: 'md', action: { type: 'uri', label: clip(c.cta.label, 40), uri: abs(c.cta.url) } }];
  if (c.cta2) footer.push({ type: 'button', style: 'link', color: TEAL, height: 'sm', action: { type: 'uri', label: clip(c.cta2.label, 40), uri: abs(c.cta2.url) } });

  const top: Obj[] = [];
  if (c.hero) top.push(heroOf(c.hero, siteUrl));
  if (c.band) {
    top.push(
      box('horizontal', [dot(c.band.dot, '8px'), text(c.band.text, { size: 'xs', weight: 'bold', color: '#ffffff', wrap: false })], {
        backgroundColor: INK, paddingTop: '12px', paddingBottom: '12px', paddingStart: '20px', paddingEnd: '20px', spacing: 'sm', alignItems: 'center',
      }),
    );
  }

  return {
    type: 'flex',
    altText: clip(altText, 390),
    contents: {
      type: 'bubble',
      ...(top.length ? { hero: top.length === 1 ? top[0] : box('vertical', top, { paddingAll: '0px' }) } : {}),
      body: box('vertical', body, { spacing: 'md', paddingAll: '20px', paddingTop: '18px' }),
      footer: box('vertical', footer, { spacing: 'xs', paddingAll: '12px', paddingTop: '0px' }),
    },
  };
}
