'use client';

import { useState } from 'react';

interface VideoPlayerProps {
  src: string;
  title: string;
  onEnded?: () => void;
}

export function VideoPlayer({ src, title, onEnded }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative aspect-video bg-dark rounded-2xl overflow-hidden">
      <video
        src={src}
        className="w-full h-full object-contain"
        controls
        controlsList="nodownload"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
      >
        <track kind="captions" />
      </video>

      {!isPlaying && !src && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
          <svg className="w-16 h-16 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">{title}</p>
        </div>
      )}
    </div>
  );
}
