import Link from 'next/link';
import { Logo } from './Logo';

export function SiteFooter(_props?: { variant?: 'default' | 'allsoullearn' }) {
  return (
    <footer className="bg-dark text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-heading text-xl font-medium">s</span>
              </div>
              <span className="font-heading text-xl text-white">
                soulsilent<span className="text-primary">.</span>
              </span>
            </div>
            <p className="text-gray-light text-sm max-w-xs leading-relaxed">
              เรียนรู้ไปด้วยกัน ผ่านประสบการณ์จริงที่ออกแบบมาเพื่อคุณ
            </p>
            <p className="font-mono text-xs text-gray tracking-[0.15em] mt-3 uppercase">
              Learn beyond the room
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading text-sm font-medium mb-4">เมนู</h4>
            <ul className="space-y-2 text-sm text-gray-light">
              <li><Link href="/" className="hover:text-white transition-colors">หน้าแรก</Link></li>
              <li><Link href="/workshops" className="hover:text-white transition-colors">Workshop</Link></li>
              <li><Link href="/allsoullearn" className="hover:text-white transition-colors">คอร์สเรียน</Link></li>
              <li><Link href="/help" className="hover:text-white transition-colors">ศูนย์ช่วยเหลือ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-sm font-medium mb-4">ติดต่อเรา</h4>
            <ul className="space-y-2 text-sm text-gray-light">
              <li>hello@soulsilent.com</li>
              <li>
                <Link href="/auth/login" className="hover:text-white transition-colors">
                  เข้าสู่ระบบ
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-8 text-center text-xs text-gray">
          © {new Date().getFullYear()} soulsilent. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
