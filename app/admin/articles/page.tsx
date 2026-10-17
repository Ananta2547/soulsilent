'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import type {
  Article,
  ArticleBlock,
  ArticleCategory,
  ArticleSwatch,
  ImageMeta,
  User,
} from '@/lib/types';
import { formatArticleDate, parseBody, parseTags } from '@/lib/article-utils';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { CardFocus } from '@/components/admin/image/CardFocus';
import { cardX } from '@/lib/article-card';
import { PUBLISHED_CODE, VISIBILITY_OPTIONS, visibilityOf, type ArticleVisibility } from '@/lib/article-visibility';
import { ASPECTS, type AspectSpec } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { adminAlert, adminConfirm, AdminHead, AdminSearch, AdminChips, AdminSheet, SheetSection, Badge, RowMenu, type MenuItem } from '@/components/admin/AdminShell';
import { AdmSelect, PickDate } from '@/components/admin/pickers';

type ArticleForm = {
  slug: string;
  category: string;
  tags: string[];
  tag_input: string;
  title: string;
  excerpt: string;
  cover_swatch: ArticleSwatch;
  cover_image_url: string;
  cover_image_meta: ImageMeta | null;
  body: ArticleBlock[];
  author_id: string;
  featured: boolean;
  published: ArticleVisibility;
  date: string;
};

const SWATCHES: ArticleSwatch[] = ['teal', 'cream', 'ink', 'accent'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: ArticleForm = {
  slug: '',
  category: 'slow',
  tags: [],
  tag_input: '',
  title: '',
  excerpt: '',
  cover_swatch: 'teal',
  cover_image_url: '',
  cover_image_meta: null,
  body: [],
  author_id: '',
  featured: false,
  published: 'public',
  date: todayIso(),
};

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-ก-๛]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visFilter, setVisFilter] = useState<'all' | ArticleVisibility>('all');

  async function fetchAll() {
    setLoadError(false);
    try {
      const [aRes, uRes, cRes] = await Promise.all([
        fetch('/api/articles?all=1'),
        fetch('/api/users'),
        fetch('/api/article-categories'),
      ]);
      if (!aRes.ok || !uRes.ok || !cRes.ok) throw new Error(`HTTP ${aRes.status}/${uRes.status}/${cRes.status}`);
      const aData = (await aRes.json()) as { articles: Article[] };
      const uData = (await uRes.json()) as { users: User[] };
      const cData = (await cRes.json()) as { categories: ArticleCategory[] };
      setArticles(aData.articles || []);
      setUsers(uData.users || []);
      setCategories(cData.categories || []);
    } catch (e) {
      console.error('Failed to load articles (admin)', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchAll();
    })();
  }, []);

  // Unlisted articles are read through their link, so the list offers it.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  async function copyLink(slug: string) {
    const url = `${window.location.origin}/articles/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('คัดลอกลิงก์นี้', url);
    }
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000);
  }

  // Share level and the lead star change straight from the list.
  async function quickUpdate(slug: string, patch: { published?: ArticleVisibility; featured?: boolean }) {
    const before = articles;
    setArticles((list) =>
      list.map((x) =>
        x.slug !== slug
          ? x
          : {
              ...x,
              ...(patch.published !== undefined ? { published: PUBLISHED_CODE[patch.published] } : {}),
              ...(patch.featured !== undefined ? { featured: patch.featured ? 1 : 0 } : {}),
            }
      )
    );
    try {
      const r = await fetch(`/api/articles/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      setArticles(before);
      adminAlert('บันทึกไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
    }
  }

  function handleEdit(a: Article) {
    setForm({
      slug: a.slug,
      category: a.category,
      tags: parseTags(a),
      tag_input: '',
      title: a.title,
      excerpt: a.excerpt || '',
      cover_swatch: (a.cover_swatch || 'teal') as ArticleSwatch,
      cover_image_url: a.cover_image_url || '',
      cover_image_meta: parseImageMeta(
        (a as Article & { cover_image_meta?: string | null }).cover_image_meta
      ),
      body: parseBody(a),
      author_id: a.author_id || '',
      featured: !!a.featured,
      published: visibilityOf(a.published),
      date: a.date,
    });
    setEditingSlug(a.slug);
    setShowForm(true);
    setError(null);
  }

  function newArticle() {
    setForm(emptyForm);
    setEditingSlug(null);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = editingSlug ? `/api/articles/${editingSlug}` : '/api/articles';
    const method = editingSlug ? 'PUT' : 'POST';
    const payload = {
      ...form,
      tags: form.tags.filter((t) => t.trim().length > 0),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingSlug(null);
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!(await adminConfirm({ title: 'ลบบทความนี้?', msg: 'ลบแล้วกู้คืนไม่ได้', ok: 'ลบบทความ', danger: true }))) return;
    await fetch(`/api/articles/${slug}`, { method: 'DELETE' });
    fetchAll();
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="adm-card adm-empty">
        <p style={{ margin: '0 0 12px' }}>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="adm-btn sm">
          ลองใหม่
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visCount = (v: ArticleVisibility) => articles.filter((a) => visibilityOf(a.published) === v).length;
  const shown = articles
    .filter((a) => visFilter === 'all' || visibilityOf(a.published) === visFilter)
    .filter((a) => !q || [a.title, a.slug].some((s) => (s || '').toLowerCase().includes(q)));
  const catOf = (a: Article) => categories.find((c) => c.key === a.category)?.th || a.category;
  const menuOf = (a: Article): MenuItem[] => [
    { label: 'ดูหน้าจริง ↗', onClick: () => window.open(`/articles/${a.slug}`, '_blank', 'noopener') },
    ...(visibilityOf(a.published) === 'unlisted'
      ? [{ label: copiedSlug === a.slug ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์ (ส่งให้คนอื่นอ่าน)', onClick: () => copyLink(a.slug) }]
      : []),
    { label: 'ลบบทความ', danger: true, onClick: () => handleDelete(a.slug) },
  ];
  const visSelect = (a: Article) => (
    <AdmSelect
      value={visibilityOf(a.published)}
      onChange={(e) => quickUpdate(a.slug, { published: e.target.value as ArticleVisibility })}
      aria-label="ระดับการแชร์"
      title={VISIBILITY_OPTIONS.find((o) => o.value === visibilityOf(a.published))?.hint}
      className={`art-vis art-vis-${visibilityOf(a.published)}`}
    >
      {VISIBILITY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.th}
        </option>
      ))}
    </AdmSelect>
  );
  const star = (a: Article) => (
    <button
      type="button"
      onClick={() => quickUpdate(a.slug, { featured: !a.featured })}
      aria-pressed={!!a.featured}
      aria-label={a.featured ? 'เอาออกจาก Featured (lead)' : 'ตั้งเป็น Featured (lead)'}
      title={a.featured ? 'Featured (lead) — กดเพื่อเอาออก' : 'กดเพื่อตั้งเป็น Featured (lead)'}
      className={`adm-star${a.featured ? ' is-on' : ''}`}
    >
      {a.featured ? '★' : '☆'}
    </button>
  );

  return (
    <>
      <AdminHead
        eyebrow="admin · articles"
        title="บทความ"
        sub={`ทั้งหมด ${articles.length} บทความ · ${categories.length} หมวด · ★ = บทความเด่น (lead)`}
        actions={
          <>
            <button onClick={() => setCatPanelOpen(true)} className="adm-btn white">
              จัดการหมวด
            </button>
            <button onClick={newArticle} className="adm-btn teal">
              + เขียนบทความใหม่
            </button>
          </>
        }
      />

      <div className="adm-toolbar">
        <AdminSearch value={query} onChange={setQuery} placeholder="ค้นหาหัวเรื่องหรือ slug" />
        <AdminChips
          value={visFilter}
          onChange={setVisFilter}
          items={[
            { key: 'all', label: 'ทั้งหมด', n: articles.length },
            ...VISIBILITY_OPTIONS.map((o) => ({ key: o.value, label: o.th, n: visCount(o.value) })),
          ]}
        />
      </div>

      <div className="adm-card">
        {shown.length === 0 ? (
          <div className="adm-empty">{articles.length === 0 ? 'ยังไม่มีบทความ' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}</div>
        ) : (
          <>
            <div className="adm-table-wrap has-cards">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>บทความ</th>
                    <th>หมวด</th>
                    <th>วันที่</th>
                    <th>การแชร์</th>
                    <th aria-label="บทความเด่น">★</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="adm-cell-title">
                          <div style={{ minWidth: 0 }}>
                            <b>{a.title}</b>
                            <small className="adm-mono" style={{ fontSize: 12 }}>
                              /{a.slug}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="teal">{catOf(a)}</Badge>
                      </td>
                      <td className="adm-meta" style={{ whiteSpace: 'nowrap' }}>
                        {formatArticleDate(a.date, 'th')}
                      </td>
                      <td>{visSelect(a)}</td>
                      <td>{star(a)}</td>
                      <td className="act">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => handleEdit(a)} className="adm-btn sm">
                            แก้ไข
                          </button>
                          <RowMenu items={menuOf(a)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="adm-mcards">
              {shown.map((a) => (
                <div key={a.id} className="adm-mcard">
                  <div className="adm-mcard-top">
                    <div>
                      <div className="adm-mcard-title">{a.title}</div>
                      <div className="adm-mcard-sub adm-mono" style={{ fontSize: 12 }}>
                        /{a.slug}
                      </div>
                    </div>
                    {star(a)}
                  </div>
                  <div className="adm-badges" style={{ alignItems: 'center' }}>
                    <Badge tone="teal">{catOf(a)}</Badge>
                    {visSelect(a)}
                  </div>
                  <div className="adm-meta">{formatArticleDate(a.date, 'th')}</div>
                  <div className="adm-mcard-acts">
                    <button onClick={() => handleEdit(a)} className="adm-btn sm">
                      แก้ไข
                    </button>
                    <RowMenu items={menuOf(a)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AdminSheet
        open={catPanelOpen}
        onClose={() => setCatPanelOpen(false)}
        eyebrow="admin · articles"
        title="หมวดบทความ"
        width={720}
      >
        <div className="adm-form">
          <CategoryPanel categories={categories} articles={articles} onChanged={fetchAll} />
        </div>
      </AdminSheet>

      <AdminSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        eyebrow="admin · articles"
        title={editingSlug ? 'แก้ไขบทความ' : 'เขียนบทความใหม่'}
        sub={editingSlug ? form.title || form.slug : undefined}
        width={820}
        footer={
          <>
            <button type="button" onClick={() => setShowForm(false)} className="adm-btn">
              ยกเลิก
            </button>
            <button type="submit" form="art-form" disabled={saving} className="adm-btn teal">
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </>
        }
      >
        <form id="art-form" onSubmit={handleSubmit}>
          {error && (
            <div className="adm-notice" style={{ background: '#fde4e1', color: '#a3261a', borderRadius: 14, marginTop: 16 }}>
              {error}
            </div>
          )}

          <SheetSection n={1} title="ข้อมูลบทความ">
            <div className="adm-field">
              <label htmlFor="art-title">หัวเรื่อง</label>
              <input
                id="art-title"
                value={form.title}
                onChange={(e) => {
                  const t = e.target.value;
                  setForm((f) => ({ ...f, title: t, slug: editingSlug || f.slug ? f.slug : slugify(t) }));
                }}
                required
              />
            </div>
            <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="adm-field">
                <label htmlFor="art-slug">Slug</label>
                <input
                  id="art-slug"
                  className="adm-mono"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                  placeholder="my-article-slug"
                  required
                />
                <p className="adm-hint">
                  URL: /articles/<b>{form.slug || '<slug>'}</b>
                </p>
              </div>
              <div className="adm-field">
                <label>วันที่</label>
                <PickDate value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              </div>
            </div>
            <div className="adm-field">
              <label htmlFor="art-excerpt">เกริ่นนำ (excerpt)</label>
              <textarea id="art-excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} />
            </div>
            <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="adm-field">
                <label htmlFor="art-cat">หมวด</label>
                <AdmSelect id="art-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.length === 0 ? (
                    <option value="" disabled>
                      — ยังไม่มีหมวดในระบบ —
                    </option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.th} · {c.en}
                      </option>
                    ))
                  )}
                </AdmSelect>
              </div>
              <div className="adm-field">
                <label htmlFor="art-author">ผู้เขียน</label>
                <AdmSelect id="art-author" value={form.author_id} onChange={(e) => setForm({ ...form, author_id: e.target.value })}>
                  <option value="">— ไม่ระบุ —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </AdmSelect>
              </div>
            </div>
            <div className="adm-field">
              <label htmlFor="art-tag">แท็ก</label>
              <input
                id="art-tag"
                value={form.tag_input}
                onChange={(e) => setForm({ ...form, tag_input: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const v = form.tag_input.trim();
                    if (v && !form.tags.includes(v)) setForm({ ...form, tags: [...form.tags, v], tag_input: '' });
                    else setForm({ ...form, tag_input: '' });
                  }
                }}
                placeholder="พิมพ์แล้วกด Enter"
              />
              {form.tags.length > 0 && (
                <div className="adm-badges" style={{ marginTop: 8 }}>
                  {form.tags.map((t) => (
                    <span key={t} className="adm-tag">
                      #{t}
                      <button type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} aria-label={`เอา ${t} ออก`}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SheetSection>

          <SheetSection n={2} title="รูปปก">
            <div className="adm-field">
              <span className="adm-field-label">สี swatch (กรณีไม่ใส่รูปจริง)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {SWATCHES.map((s) => {
                  const bg = s === 'cream' ? '#ede5cf' : s === 'ink' ? '#0d1e1d' : s === 'accent' ? '#fce4a0' : '#d4ece8';
                  const selected = form.cover_swatch === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, cover_swatch: s })}
                      aria-label={s}
                      aria-pressed={selected}
                      style={{
                        width: 44,
                        height: 32,
                        borderRadius: 10,
                        background: bg,
                        border: 0,
                        cursor: 'pointer',
                        boxShadow: selected ? '0 0 0 2px white, 0 0 0 4px var(--teal)' : '0 0 0 1px rgba(0,0,0,.1)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="adm-field">
              <span className="adm-field-label">รูปจริง (อัปโหลด — ทับ swatch ถ้ามี)</span>
              {/* The cover lives in 2 spots: crop it here for the 3:1 header of
                  the article page, then pick below which 4:3 part the cards
                  show (kept as card_x in the same meta). */}
              <ImageUploader
                folder="article"
                primary={ASPECTS.ARTICLE_HERO}
                value={form.cover_image_url}
                meta={form.cover_image_meta}
                onChange={({ url, meta }) =>
                  setForm({
                    ...form,
                    cover_image_url: url,
                    cover_image_meta: meta ? { ...meta, card_x: form.cover_image_meta?.card_x } : null,
                  })
                }
              />
              {form.cover_image_url && form.cover_image_meta && (
                <CardFocus
                  src={form.cover_image_url}
                  value={cardX(form.cover_image_meta)}
                  onChange={(x) => setForm({ ...form, cover_image_meta: { ...form.cover_image_meta!, card_x: x } })}
                />
              )}
            </div>
          </SheetSection>

          <SheetSection n={3} title="การเผยแพร่">
            <div className="adm-field">
              <label htmlFor="art-vis">ระดับการแชร์</label>
              <AdmSelect id="art-vis" value={form.published} onChange={(e) => setForm({ ...form, published: e.target.value as ArticleVisibility })}>
                {VISIBILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.th} — {o.hint}
                  </option>
                ))}
              </AdmSelect>
            </div>
            <label className="adm-check" style={{ margin: '0 -14px' }}>
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
              <div>
                <b>บทความเด่น (Featured lead)</b>
                <span>แสดงเป็นบทความหลักบนหน้าบทความ</span>
              </div>
            </label>
          </SheetSection>

          <SheetSection n={4} title="เนื้อหา">
            <div className="adm-form">
              <BlockEditor blocks={form.body} onChange={(blocks) => setForm({ ...form, body: blocks })} />
            </div>
          </SheetSection>
        </form>
      </AdminSheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Block editor — add/edit/move/remove body blocks                    */
/* ------------------------------------------------------------------ */

type BlockKind = ArticleBlock['kind'];

const BLOCK_LABELS: Record<BlockKind, string> = {
  h2: 'หัวข้อใหญ่ (H2)',
  h3: 'หัวข้อย่อย (H3)',
  p: 'ย่อหน้า',
  quote: 'คำพูดอ้าง',
  caption: 'คำอธิบายภาพ',
  image: 'รูปประกอบ',
};

function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: ArticleBlock[];
  onChange: (b: ArticleBlock[]) => void;
}) {
  const [adding, setAdding] = useState<BlockKind>('p');

  function addBlock() {
    let block: ArticleBlock;
    switch (adding) {
      case 'image':
        block = { kind: 'image', swatch: 'cream', hint: '', aspect: '16/9' };
        break;
      case 'quote':
        block = { kind: 'quote', text: '', by: '' };
        break;
      default:
        block = { kind: adding, text: '' };
    }
    onChange([...blocks, block]);
  }
  function updateBlock(i: number, patch: Partial<ArticleBlock>) {
    const next = blocks.map((b, idx) =>
      idx === i ? ({ ...b, ...patch } as ArticleBlock) : b
    );
    onChange(next);
  }
  function removeBlock(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const tmp = next[i];
    next[i] = next[to];
    next[to] = tmp;
    onChange(next);
  }

  return (
    <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
      <legend className="text-sm font-medium text-dark px-2">เนื้อหา (block editor)</legend>

      {blocks.length === 0 && (
        <p className="text-xs text-gray text-center py-4">
          ยังไม่มีเนื้อหา — เลือก block แล้วกด &quot;+ เพิ่ม block&quot;
        </p>
      )}

      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div
            key={i}
            className="p-3 rounded-xl bg-white border border-gray-lighter space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray bg-cream px-2 py-1 rounded">
                {BLOCK_LABELS[b.kind]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-gray text-xs px-2 hover:text-primary disabled:opacity-30"
                  title="ขึ้น"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === blocks.length - 1}
                  className="text-gray text-xs px-2 hover:text-primary disabled:opacity-30"
                  title="ลง"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(i)}
                  className="text-red-500 text-xs px-2 hover:underline"
                >
                  ลบ
                </button>
              </div>
            </div>

            {b.kind === 'h2' || b.kind === 'h3' || b.kind === 'p' || b.kind === 'caption' ? (
              <textarea
                value={'text' in b ? b.text : ''}
                onChange={(e) => updateBlock(i, { text: e.target.value })}
                className="input-field"
                rows={b.kind === 'p' ? 4 : 2}
                placeholder={
                  b.kind === 'p'
                    ? 'พิมพ์เนื้อหา…'
                    : b.kind === 'caption'
                      ? 'คำอธิบายภาพ'
                      : 'หัวข้อ…'
                }
              />
            ) : null}

            {b.kind === 'quote' ? (
              <>
                <textarea
                  value={b.text}
                  onChange={(e) => updateBlock(i, { text: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="คำพูดอ้าง"
                />
                <input
                  value={b.by || ''}
                  onChange={(e) => updateBlock(i, { by: e.target.value })}
                  className="input-field !py-2"
                  placeholder="โดย (ผู้พูด)"
                />
              </>
            ) : null}

            {b.kind === 'image' ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {SWATCHES.map((s) => {
                    const bg =
                      s === 'cream'
                        ? '#ede5cf'
                        : s === 'ink'
                          ? '#0d1e1d'
                          : s === 'accent'
                            ? '#fce4a0'
                            : '#d4ece8';
                    const selected = b.swatch === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => updateBlock(i, { swatch: s })}
                        style={{
                          height: 26,
                          borderRadius: 6,
                          background: bg,
                          border: 0,
                          cursor: 'pointer',
                          boxShadow: selected
                            ? '0 0 0 2px white, 0 0 0 3px var(--teal)'
                            : 'none',
                        }}
                      >
                        <span className="text-[9px] font-mono uppercase tracking-wider opacity-60">
                          {s}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <input
                  value={b.hint || ''}
                  onChange={(e) => updateBlock(i, { hint: e.target.value })}
                  className="input-field !py-2"
                  placeholder="คำใบ้สำหรับรูป (เช่น photo — sunset)"
                />
                <AdmSelect
                  value={b.aspect || '16/9'}
                  onChange={(e) => updateBlock(i, { aspect: e.target.value })}
                  className="input-field !py-2"
                >
                  <option value="16/9">16:9</option>
                  <option value="4/3">4:3</option>
                  <option value="1/1">1:1</option>
                </AdmSelect>
                <div>
                  <label className="block text-[10px] font-medium text-gray mb-1.5 uppercase tracking-wider">
                    รูปจริง (ทับ swatch ถ้ามี)
                  </label>
                  <ImageUploader
                    folder="article"
                    /* Aspect per block — admin's choice. Crop to it. */
                    primary={aspectFromBody(b.aspect)}
                    value={b.url || ''}
                    onChange={({ url }) => updateBlock(i, { url })}
                  />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-lighter">
        <AdmSelect
          value={adding}
          onChange={(e) => setAdding(e.target.value as BlockKind)}
          className="input-field !py-2 !w-auto flex-1"
        >
          {Object.entries(BLOCK_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </AdmSelect>
        <button
          type="button"
          onClick={addBlock}
          className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
        >
          + เพิ่ม block
        </button>
      </div>
    </fieldset>
  );
}

/** Map an article body image block's aspect string to an AspectSpec. */
function aspectFromBody(a: string | undefined): AspectSpec {
  if (a === '4/3') return ASPECTS.ARTICLE_BODY_4_3;
  if (a === '1/1') return ASPECTS.ARTICLE_BODY_1_1;
  return ASPECTS.ARTICLE_BODY_16_9;
}

/* ------------------------------------------------------------------ */
/* Category CRUD panel                                                 */
/* ------------------------------------------------------------------ */
function CategoryPanel({
  categories,
  articles,
  onChanged,
}: {
  categories: ArticleCategory[];
  articles: Article[];
  onChanged: () => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newTh, setNewTh] = useState('');
  const [newEn, setNewEn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count how many articles use each category — for the delete-warning UX
  const usageCount = (key: string) => articles.filter((a) => a.category === key).length;

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/article-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey, th: newTh, en: newEn }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'เพิ่มไม่สำเร็จ');
        return;
      }
      setNewKey('');
      setNewTh('');
      setNewEn('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(key: string, patch: Partial<ArticleCategory>) {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return;
    await fetch(`/api/article-categories/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cat, ...patch }),
    });
    onChanged();
  }

  async function deleteCategory(key: string) {
    const count = usageCount(key);
    if (count > 0) {
      adminAlert('ลบหมวดนี้ไม่ได้', `มีบทความ ${count} ชิ้นที่ยังใช้หมวด "${key}" อยู่ ย้ายบทความก่อน`);
      return;
    }
    if (!(await adminConfirm({ title: `ลบหมวด "${key}"?`, ok: 'ลบหมวด', danger: true }))) return;
    await fetch(`/api/article-categories/${key}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="card !p-6 space-y-4">
      <div>
        <p className="text-xs font-mono text-primary tracking-[.16em] uppercase mb-1">
          article categories
        </p>
        <h2 className="font-heading text-xl text-dark">หมวดบทความ</h2>
        <p className="text-xs text-gray mt-1">
          แก้ชื่อ TH/EN ของแต่ละหมวด · เพิ่มหมวดใหม่ · ลบที่ไม่ใช้แล้ว (ลบไม่ได้ถ้ามีบทความใช้อยู่)
        </p>
      </div>

      {/* Existing categories — editable inline */}
      <div className="space-y-2">
        {categories.length === 0 && (
          <p className="text-sm text-gray text-center py-4">ยังไม่มีหมวด</p>
        )}
        {categories.map((c) => {
          const count = usageCount(c.key);
          return (
            <div
              key={c.key}
              className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-surface"
            >
              <div className="col-span-12 sm:col-span-2 font-mono text-xs text-gray tracking-wider">
                {c.key}
              </div>
              <div className="col-span-12 sm:col-span-3">
                <input
                  value={c.th}
                  onChange={(e) => updateCategory(c.key, { th: e.target.value })}
                  className="input-field !py-2"
                  placeholder="ภาษาไทย"
                />
              </div>
              <div className="col-span-12 sm:col-span-3">
                <input
                  value={c.en}
                  onChange={(e) => updateCategory(c.key, { en: e.target.value })}
                  className="input-field !py-2"
                  placeholder="English"
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <input
                  type="number"
                  value={c.sort_order}
                  onChange={(e) =>
                    updateCategory(c.key, { sort_order: +e.target.value })
                  }
                  className="input-field !py-2"
                  placeholder="ลำดับ"
                  title="ลำดับการแสดง (น้อยมาก่อน)"
                />
              </div>
              <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-2 text-xs">
                <span className="text-gray font-mono">{count} ใช้</span>
                <button
                  type="button"
                  onClick={() => deleteCategory(c.key)}
                  disabled={count > 0}
                  className="text-red-500 font-medium hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
                  title={count > 0 ? `มี ${count} บทความใช้หมวดนี้อยู่` : 'ลบหมวด'}
                >
                  ลบ
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new */}
      <form
        onSubmit={addCategory}
        className="border-t border-gray-lighter pt-4 grid grid-cols-12 gap-2 items-end"
      >
        <div className="col-span-12 sm:col-span-3">
          <label className="block text-xs font-medium text-dark mb-1">key (a-z 0-9 -)</label>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className="input-field !py-2"
            placeholder="ux-research"
            required
          />
        </div>
        <div className="col-span-12 sm:col-span-3">
          <label className="block text-xs font-medium text-dark mb-1">ภาษาไทย</label>
          <input
            value={newTh}
            onChange={(e) => setNewTh(e.target.value)}
            className="input-field !py-2"
            placeholder="งานวิจัย UX"
            required
          />
        </div>
        <div className="col-span-12 sm:col-span-3">
          <label className="block text-xs font-medium text-dark mb-1">English</label>
          <input
            value={newEn}
            onChange={(e) => setNewEn(e.target.value)}
            className="input-field !py-2"
            placeholder="UX Research"
            required
          />
        </div>
        <div className="col-span-12 sm:col-span-3">
          <button type="submit" disabled={busy} className="btn-primary text-sm w-full">
            {busy ? '...' : '+ เพิ่มหมวด'}
          </button>
        </div>
        {error && <p className="col-span-12 text-xs text-red-500">{error}</p>}
      </form>
    </div>
  );
}
