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
import { ASPECTS, type AspectSpec } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';

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
  published: boolean;
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
  published: true,
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
    fetchAll();
  }, []);

  // Drafts: copy a link anyone can open to read it before it is published.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  async function copyShareLink(slug: string) {
    try {
      const r = await fetch(`/api/articles/${encodeURIComponent(slug)}/share`);
      const d = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !d.path) throw new Error(d.error || 'share failed');
      const url = window.location.origin + d.path;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt('คัดลอกลิงก์นี้', url);
      }
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000);
    } catch {
      alert('สร้างลิงก์แชร์ไม่สำเร็จ');
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
      published: !!a.published,
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
    if (!confirm('ลบบทความนี้?')) return;
    await fetch(`/api/articles/${slug}`, { method: 'DELETE' });
    fetchAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted">
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="border border-primary text-primary rounded-full px-6 py-2 text-sm font-semibold">ลองใหม่</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
            admin · articles
          </p>
          <h1 className="font-heading text-3xl text-dark">จัดการบทความ</h1>
          <p className="text-sm text-gray mt-1">
            ทั้งหมด {articles.length} บทความ · {categories.length} หมวด
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCatPanelOpen((o) => !o)}
            className="btn-ghost text-sm"
          >
            {catPanelOpen ? '× ปิดหมวด' : '⚙ จัดการหมวด'}
          </button>
          <button onClick={newArticle} className="btn-primary text-sm">
            + เขียนบทความใหม่
          </button>
        </div>
      </header>

      {catPanelOpen && (
        <CategoryPanel
          categories={categories}
          articles={articles}
          onChanged={fetchAll}
        />
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Sticky header — stays visible while the body scrolls */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-lighter flex-shrink-0">
              <h2 className="font-heading text-xl text-dark">
                {editingSlug ? `แก้ไข: ${form.title || form.slug}` : 'เขียนบทความใหม่'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="ปิด"
                className="flex-shrink-0 w-9 h-9 rounded-full bg-surface hover:bg-gray-lighter text-dark flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title + slug + excerpt */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">หัวเรื่อง</label>
                <input
                  value={form.title}
                  onChange={(e) => {
                    const t = e.target.value;
                    setForm((f) => ({
                      ...f,
                      title: t,
                      slug: editingSlug || f.slug ? f.slug : slugify(t),
                    }));
                  }}
                  className="input-field"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-dark mb-1">Slug</label>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    className="input-field"
                    placeholder="my-article-slug"
                    required
                  />
                  <p className="text-xs text-gray mt-1">
                    URL: /articles/<b>{form.slug || '<slug>'}</b>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">วันที่</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">เกริ่นนำ (excerpt)</label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  className="input-field"
                  rows={2}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">หมวด</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="input-field"
                >
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
                </select>
                <p className="text-xs text-gray mt-1">
                  จัดการรายชื่อหมวดในส่วน &quot;หมวดบทความ&quot; ด้านล่าง
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">แท็ก</label>
                <div className="flex gap-2">
                  <input
                    value={form.tag_input}
                    onChange={(e) => setForm({ ...form, tag_input: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const v = form.tag_input.trim();
                        if (v && !form.tags.includes(v)) {
                          setForm({ ...form, tags: [...form.tags, v], tag_input: '' });
                        } else {
                          setForm({ ...form, tag_input: '' });
                        }
                      }
                    }}
                    className="input-field flex-1"
                    placeholder="พิมพ์แล้วกด Enter"
                  />
                </div>
                {form.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {form.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, tags: form.tags.filter((x) => x !== t) })
                          }
                          className="text-primary/60 hover:text-red-500 ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Cover */}
              <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
                <legend className="text-sm font-medium text-dark px-2">รูปปก</legend>
                <div>
                  <label className="block text-xs font-medium text-dark mb-2">
                    สี swatch (กรณีไม่ใส่รูปจริง)
                  </label>
                  <div className="flex gap-2">
                    {SWATCHES.map((s) => {
                      const bg =
                        s === 'cream'
                          ? '#ede5cf'
                          : s === 'ink'
                            ? '#0d1e1d'
                            : s === 'accent'
                              ? '#fce4a0'
                              : '#d4ece8';
                      const selected = form.cover_swatch === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm({ ...form, cover_swatch: s })}
                          aria-label={s}
                          style={{
                            width: 44,
                            height: 32,
                            borderRadius: 8,
                            background: bg,
                            border: 0,
                            cursor: 'pointer',
                            boxShadow: selected
                              ? '0 0 0 2px white, 0 0 0 4px var(--teal)'
                              : '0 0 0 1px rgba(0,0,0,.1)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-dark mb-2">
                    รูปจริง <span className="text-gray font-normal">(อัปโหลด — ทับ swatch ถ้ามี)</span>
                  </label>
                  {/* The cover lives in 2 spots: crop it here for the 3:1
                      header of the article page, then pick below which 4:3
                      part the cards show (kept as card_x in the same meta). */}
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
              </fieldset>

              {/* Author + flags */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-dark mb-1">ผู้เขียน</label>
                  <select
                    value={form.author_id}
                    onChange={(e) => setForm({ ...form, author_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.published}
                      onChange={(e) => setForm({ ...form, published: e.target.checked })}
                    />
                    เผยแพร่
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    />
                    Featured (lead)
                  </label>
                </div>
              </div>

              {/* Body editor */}
              <BlockEditor
                blocks={form.body}
                onChange={(blocks) => setForm({ ...form, body: blocks })}
              />

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">
                  ยกเลิก
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-4 text-gray font-medium">หัวเรื่อง</th>
                <th className="text-left py-3 px-4 text-gray font-medium">หมวด</th>
                <th className="text-left py-3 px-4 text-gray font-medium">วันที่</th>
                <th className="text-center py-3 px-4 text-gray font-medium">สถานะ</th>
                <th className="text-right py-3 px-4 text-gray font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const cat = categories.find((c) => c.key === a.category);
                return (
                  <tr key={a.id} className="border-t border-gray-lighter hover:bg-surface/50">
                    <td className="py-3 px-4">
                      <div className="text-dark font-medium max-w-[360px] truncate">{a.title}</div>
                      <div className="text-xs text-gray font-mono mt-0.5">/{a.slug}</div>
                    </td>
                    <td className="py-3 px-4 text-gray text-xs">{cat?.th || a.category}</td>
                    <td className="py-3 px-4 text-gray text-xs">
                      {formatArticleDate(a.date, 'th')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {a.published ? (
                        <span className="badge-success">เผยแพร่</span>
                      ) : (
                        <span className="badge-accent">ฉบับร่าง</span>
                      )}
                      {!!a.featured && (
                        <span
                          className="badge ml-1"
                          style={{ background: 'var(--accent)', color: 'var(--ink)' }}
                        >
                          ★
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/articles/${a.slug}`}
                          target="_blank"
                          className="text-gray text-xs font-medium hover:text-primary hover:underline"
                        >
                          ดู ↗
                        </a>
                        {!a.published && (
                          <button
                            onClick={() => copyShareLink(a.slug)}
                            title="ลิงก์ให้คนอื่นอ่านฉบับร่างนี้ได้ ก่อนเผยแพร่"
                            className="text-primary text-xs font-medium hover:underline"
                          >
                            {copiedSlug === a.slug ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์แชร์'}
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(a)}
                          className="text-primary text-xs font-medium hover:underline"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDelete(a.slug)}
                          className="text-red-500 text-xs font-medium hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {articles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray">
                    ยังไม่มีบทความ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
                <select
                  value={b.aspect || '16/9'}
                  onChange={(e) => updateBlock(i, { aspect: e.target.value })}
                  className="input-field !py-2"
                >
                  <option value="16/9">16:9</option>
                  <option value="4/3">4:3</option>
                  <option value="1/1">1:1</option>
                </select>
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
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value as BlockKind)}
          className="input-field !py-2 !w-auto flex-1"
        >
          {Object.entries(BLOCK_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
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
  const useCount = (key: string) => articles.filter((a) => a.category === key).length;

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
    const count = useCount(key);
    if (count > 0) {
      alert(`ลบไม่ได้ — มีบทความ ${count} ชิ้นที่ยังใช้หมวด "${key}" อยู่ ย้ายบทความก่อน`);
      return;
    }
    if (!confirm(`ลบหมวด "${key}"?`)) return;
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
          const count = useCount(c.key);
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
