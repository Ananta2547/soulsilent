'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { VideoPlayer } from '@/components/features/VideoPlayer';
import type { Course, Lesson } from '@/lib/types';

export default function LearnPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [courseRes, lessonsRes] = await Promise.all([
          fetch(`/api/courses/${id}`),
          fetch(`/api/courses/${id}/lessons?enrolled=true`),
        ]);
        const courseData = (await courseRes.json()) as { course: Course; enrolled: boolean };
        const lessonsData = (await lessonsRes.json()) as { lessons: Lesson[] };
        if (!courseData.enrolled) {
          setUnauthorized(true);
          return;
        }
        setCourse(courseData.course);
        const lessonList = lessonsData.lessons || [];
        setLessons(lessonList);
        if (lessonList.length > 0) setActiveLesson(lessonList[0]);
      } catch { setUnauthorized(true); }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (unauthorized || !course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-gray text-lg mb-4">คุณยังไม่ได้ลงทะเบียนคอร์สนี้</p>
        <Link href={`/allsoullearn/courses/${id}`} className="btn-primary">ดูรายละเอียดคอร์ส</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 lg:gap-6 py-6 px-4 lg:px-8">
          {/* Video Player */}
          <div className="lg:col-span-3">
            <VideoPlayer
              src={activeLesson?.video_key ? `/api/stream/${activeLesson.video_key}` : ''}
              title={activeLesson?.title || 'เลือกบทเรียน'}
            />
            <div className="mt-4">
              <h1 className="font-heading text-xl text-dark">{activeLesson?.title}</h1>
              {activeLesson?.description && (
                <p className="text-gray text-sm mt-2">{activeLesson.description}</p>
              )}
            </div>
          </div>

          {/* Lesson Sidebar */}
          <div className="lg:col-span-1 mt-6 lg:mt-0">
            <div className="card !p-0 overflow-hidden">
              <div className="p-4 border-b border-gray-lighter">
                <h2 className="font-heading text-sm text-dark">{course.title}</h2>
                <p className="text-xs text-gray mt-0.5">{lessons.length} บทเรียน</p>
              </div>
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                {lessons.map((lesson, index) => (
                  <button
                    key={lesson.id}
                    onClick={() => setActiveLesson(lesson)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-lighter/50 transition-colors ${
                      activeLesson?.id === lesson.id
                        ? 'bg-primary/5 border-l-2 border-l-primary'
                        : 'hover:bg-surface'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      activeLesson?.id === lesson.id
                        ? 'bg-primary text-white'
                        : 'bg-gray-lighter text-gray'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-dark truncate">{lesson.title}</p>
                      {lesson.duration_seconds && (
                        <p className="text-xs text-gray">{Math.floor(lesson.duration_seconds / 60)} นาที</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
