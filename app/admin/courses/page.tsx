'use client';

import { useEffect, useState } from 'react';
import type { Course } from '@/lib/types';
import { parseImageMeta } from '@/lib/image-meta';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import {
  CourseForm,
  emptyCourseForm,
  type CourseFormValues,
} from './_components/CourseForm';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; id: string; initial: CourseFormValues; title: string }
  | null;

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);

  async function fetchCourses() {
    const res = await fetch('/api/courses?all=1');
    const data = (await res.json()) as { courses: Course[] };
    setCourses(data.courses || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await fetchCourses();
    })();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบคอร์สนี้?')) return;
    await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    fetchCourses();
  }

  async function openEdit(id: string) {
    setLoadingEdit(id);
    try {
      const res = await fetch(`/api/courses/${id}`);
      if (!res.ok) {
        alert('โหลดคอร์สไม่สำเร็จ');
        return;
      }
      const data = (await res.json()) as {
        course: Course & { thumbnail_meta?: string | null };
      };
      const c = data.course;
      const initial: CourseFormValues = {
        title: c.title,
        description: c.description || '',
        short_description: c.short_description || '',
        price: c.price,
        thumbnail_url: c.thumbnail_url || '',
        thumbnail_meta: parseImageMeta(c.thumbnail_meta),
        category: c.category || '',
        level: c.level,
        status: c.status,
      };
      setModal({ mode: 'edit', id, initial, title: c.title });
    } finally {
      setLoadingEdit(null);
    }
  }

  function closeAndRefresh() {
    setModal(null);
    fetchCourses();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
            admin · courses · overview
          </p>
          <h1 className="font-heading text-3xl text-dark">จัดการคอร์สเรียน</h1>
          <p className="text-sm text-gray mt-1">
            ทั้งหมด {courses.length} คอร์ส · allsoullearn
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="btn-primary text-sm"
        >
          + เพิ่มคอร์ส
        </button>
      </header>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-4 text-gray font-medium">ชื่อคอร์ส</th>
                <th className="text-left py-3 px-4 text-gray font-medium">หมวดหมู่</th>
                <th className="text-left py-3 px-4 text-gray font-medium">ระดับ</th>
                <th className="text-left py-3 px-4 text-gray font-medium">ราคา</th>
                <th className="text-left py-3 px-4 text-gray font-medium">สถานะ</th>
                <th className="text-right py-3 px-4 text-gray font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id} className="border-t border-gray-lighter hover:bg-surface/50">
                  <td className="py-3 px-4 text-dark font-medium max-w-[200px] truncate">
                    {course.title}
                  </td>
                  <td className="py-3 px-4 text-gray">{course.category || '-'}</td>
                  <td className="py-3 px-4">
                    <span className="badge-primary">
                      {course.level === 'beginner'
                        ? 'เริ่มต้น'
                        : course.level === 'intermediate'
                          ? 'กลาง'
                          : 'ขั้นสูง'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-dark font-medium">฿{course.price.toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        course.status === 'published'
                          ? 'badge-success'
                          : course.status === 'archived'
                            ? 'badge bg-gray-lighter text-gray'
                            : 'badge-accent'
                      }
                    >
                      {course.status === 'published'
                        ? 'เผยแพร่'
                        : course.status === 'draft'
                          ? 'แบบร่าง'
                          : 'เก็บถาวร'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(course.id)}
                        disabled={loadingEdit === course.id}
                        className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                      >
                        {loadingEdit === course.id ? 'กำลังโหลด...' : 'แก้ไข'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(course.id)}
                        className="text-red-500 text-xs font-medium hover:underline"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray">
                    ยังไม่มีคอร์ส —{' '}
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'create' })}
                      className="text-primary hover:underline"
                    >
                      เพิ่มคอร์สแรก
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminFormModal
        open={modal !== null}
        title={modal?.mode === 'edit' ? 'แก้ไขคอร์ส' : 'เพิ่มคอร์สใหม่'}
        subtitle={modal?.mode === 'edit' ? modal.title : undefined}
        onClose={() => setModal(null)}
      >
        {modal?.mode === 'edit' ? (
          <CourseForm
            key={modal.id}
            initial={modal.initial}
            editingId={modal.id}
            onSuccess={closeAndRefresh}
            onCancel={() => setModal(null)}
          />
        ) : modal?.mode === 'create' ? (
          <CourseForm
            key="create"
            initial={emptyCourseForm}
            onSuccess={closeAndRefresh}
            onCancel={() => setModal(null)}
          />
        ) : null}
      </AdminFormModal>
    </div>
  );
}
