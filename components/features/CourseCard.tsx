import Link from 'next/link';
import type { Course } from '@/lib/types';

const levelLabels: Record<string, string> = {
  beginner: 'เริ่มต้น',
  intermediate: 'กลาง',
  advanced: 'ขั้นสูง',
};

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/allsoullearn/courses/${course.id}`} className="card group block">
      {course.thumbnail_url ? (
        <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-surface">
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="aspect-video rounded-xl mb-4 bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center">
          <svg className="w-12 h-12 text-accent/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        {course.category && <span className="badge-accent">{course.category}</span>}
        <span className="badge-primary">{levelLabels[course.level] || course.level}</span>
      </div>

      <h3 className="font-heading text-lg text-dark group-hover:text-primary transition-colors line-clamp-2">
        {course.title}
      </h3>

      {course.short_description && (
        <p className="text-sm text-gray mt-1 line-clamp-2">{course.short_description}</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-lighter">
        <span className="text-xs text-gray font-mono uppercase tracking-wider">
          Online Course
        </span>
        <span className="font-heading text-lg text-primary font-medium">
          ฿{course.price.toLocaleString()}
        </span>
      </div>
    </Link>
  );
}
