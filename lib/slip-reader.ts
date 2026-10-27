/**
 * Reading a Thai bank-transfer slip, for the ledger's "บันทึกรายการ" form.
 *
 * Two sources, each doing what it is good at:
 * - the slip's QR code (decoded in the browser with jsQR) carries the
 *   transaction reference and the sending bank exactly — parseSlipQr
 * - Gemini reads everything else off the picture: amount, date and time,
 *   who sent and who received, banks, the masked account, the memo
 * The admin always checks the filled form before saving.
 */

/** Thai bank codes in the slip QR (the 3-digit code in the payload). */
export const BANK_CODES: Record<string, string> = {
  '002': 'กรุงเทพ',
  '004': 'กสิกรไทย',
  '006': 'กรุงไทย',
  '011': 'ทหารไทยธนชาต',
  '014': 'ไทยพาณิชย์',
  '022': 'ซีไอเอ็มบี',
  '024': 'ยูโอบี',
  '025': 'กรุงศรีอยุธยา',
  '030': 'ออมสิน',
  '033': 'อาคารสงเคราะห์',
  '034': 'ธ.ก.ส.',
  '066': 'อิสลามแห่งประเทศไทย',
  '067': 'ทิสโก้',
  '069': 'เกียรตินาคินภัทร',
  '070': 'ไอซีบีซี',
  '071': 'ไทยเครดิต',
  '073': 'แลนด์ แอนด์ เฮ้าส์',
};

/** Tag–length–value fields of an EMV-style payload ("00 46 …"). */
function tlv(s: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || i + 4 + len > s.length) break;
    out.set(id, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

/** The slip QR ("mini QR" of Thai banks): tag 00 holds 01 = sending bank code,
 *  02 = transaction reference. Null when the text is not a slip QR. */
export function parseSlipQr(text: string): { ref: string; bankCode: string | null; bank: string | null } | null {
  const top = tlv(text.trim());
  const inner = top.get('00');
  if (!inner) return null;
  const f = tlv(inner);
  const ref = f.get('02');
  if (!ref || !/^[A-Za-z0-9]{8,40}$/.test(ref)) return null;
  const bankCode = f.get('01') || null;
  return { ref, bankCode, bank: bankCode ? BANK_CODES[bankCode] || null : null };
}

export type SlipFields = {
  amount: number | null;
  /** Gregorian YYYY-MM-DD (Buddhist years are converted) */
  date: string | null;
  /** HH:MM, 24-hour */
  time: string | null;
  ref: string | null;
  from_name: string | null;
  from_bank: string | null;
  to_name: string | null;
  to_bank: string | null;
  /** as printed, usually masked (xxx-x-x1234-x) */
  to_account: string | null;
  /** PromptPay rather than an account-to-account transfer */
  promptpay: boolean | null;
  memo: string | null;
};

const PROMPT = `This is a Thai bank transfer slip (e-slip) or receipt. Read it and return the fields.
- amount: the amount transferred in baht, a number without commas or currency.
- date: the transfer date as YYYY-MM-DD in the Gregorian calendar. Thai slips often print Buddhist years (e.g. 2569) or two-digit Buddhist years (e.g. 69): subtract 543 from a 4-digit Buddhist year; a 2-digit year like 69 means 2569 → 2026. Thai month abbreviations: ม.ค.=01 ก.พ.=02 มี.ค.=03 เม.ย.=04 พ.ค.=05 มิ.ย.=06 ก.ค.=07 ส.ค.=08 ก.ย.=09 ต.ค.=10 พ.ย.=11 ธ.ค.=12.
- time: HH:MM, 24-hour.
- ref: the transaction / reference number (เลขที่รายการ, รหัสอ้างอิง, Ref No.), exactly as printed, no spaces.
- from_name / from_bank: the sender and the sender's bank (Thai bank name, e.g. กสิกรไทย).
- to_name / to_bank / to_account: the receiver, the receiver's bank, the receiver's account or PromptPay number exactly as printed (it may be masked).
- promptpay: true if the transfer went to a PromptPay ID (phone / citizen ID / e-wallet).
- memo: the note / บันทึกช่วยจำ if any.
Use null for anything not on the slip. Do not guess.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    amount: { type: 'NUMBER', nullable: true },
    date: { type: 'STRING', nullable: true },
    time: { type: 'STRING', nullable: true },
    ref: { type: 'STRING', nullable: true },
    from_name: { type: 'STRING', nullable: true },
    from_bank: { type: 'STRING', nullable: true },
    to_name: { type: 'STRING', nullable: true },
    to_bank: { type: 'STRING', nullable: true },
    to_account: { type: 'STRING', nullable: true },
    promptpay: { type: 'BOOLEAN', nullable: true },
    memo: { type: 'STRING', nullable: true },
  },
};

/** Ask Gemini to read the slip picture. Throws with a message admin can act on.
 *  The default is Google's rolling "latest Flash" alias so a retired model
 *  never breaks the form; when a pinned model is retired anyway (404 naming
 *  its replacement), the replacement is tried once. */
export async function readSlipWithGemini(image: { bytes: ArrayBuffer; mime: string }, key: string, model = 'gemini-flash-latest'): Promise<SlipFields> {
  let bin = '';
  const u8 = new Uint8Array(image.bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return askGemini(btoa(bin), image.mime, key, model, true);
}

async function askGemini(b64: string, mime: string, key: string, model: string, retry: boolean, think = true): Promise<SlipFields> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA, ...(think ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    let reason = '';
    try {
      reason = (JSON.parse(detail) as { error?: { message?: string } }).error?.message || '';
    } catch {}
    console.error('[slip-reader] Gemini', model, r.status, detail.slice(0, 500));
    const next = r.status === 404 && retry ? /use (?:models\/)?([\w.-]+)/i.exec(reason)?.[1]?.replace(/\.$/, '') : null;
    if (r.status === 400 && think && /thinking/i.test(reason)) return askGemini(b64, mime, key, model, retry, false);
    if (next && next !== model) return askGemini(b64, mime, key, next, false);
    if (r.status === 429) throw new Error('Gemini ใช้เกินโควต้า — รอสักครู่แล้วลองใหม่');
    if (/location is not supported/i.test(reason)) throw new Error('Gemini ไม่ให้บริการจากตำแหน่งเซิร์ฟเวอร์นี้');
    if (/api key/i.test(reason)) throw new Error('GEMINI_API_KEY ไม่ถูกต้อง');
    throw new Error(`Gemini ตอบกลับผิดพลาด (${r.status}) ${reason.slice(0, 120)}`.trim());
  }
  const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let raw: Partial<SlipFields>;
  try {
    raw = JSON.parse(text) as Partial<SlipFields>;
  } catch {
    throw new Error('อ่านสลิปไม่ออก — ลองรูปที่ชัดขึ้น');
  }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const date = s(raw.date);
  const time = s(raw.time);
  return {
    amount: typeof raw.amount === 'number' && raw.amount > 0 ? Math.round(raw.amount * 100) / 100 : null,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    time: time && /^\d{1,2}:\d{2}/.test(time) ? time.padStart(5, '0').slice(0, 5) : null,
    ref: s(raw.ref)?.replace(/\s+/g, '') || null,
    from_name: s(raw.from_name),
    from_bank: s(raw.from_bank),
    to_name: s(raw.to_name),
    to_bank: s(raw.to_bank),
    to_account: s(raw.to_account),
    promptpay: typeof raw.promptpay === 'boolean' ? raw.promptpay : null,
    memo: s(raw.memo),
  };
}
