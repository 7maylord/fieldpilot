'use client';

import { useRef } from 'react';
import { captureMedia } from '../lib/offline/media';

type Props = {
  type: 'photo' | 'signature';
  scope: {
    organizationId: string;
    projectId: string;
    entityType: string;
    entityId: string;
  };
  onCaptured: (id: string) => void;
};

export function MediaCapture({ type, scope, onCaptured }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  async function store(blob: Blob) {
    const record = await captureMedia(blob, { ...scope, mediaType: type });
    onCaptured(record.id);
  }
  if (type === 'photo')
    return (
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void store(file);
        }}
      />
    );
  return (
    <div>
      <canvas
        ref={canvas}
        width="480"
        height="160"
        aria-label="Signature pad"
        onPointerDown={(event) => {
          const context = canvas.current!.getContext('2d')!;
          context.beginPath();
          context.moveTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const context = canvas.current!.getContext('2d')!;
          context.lineTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
          context.stroke();
        }}
      />
      <button
        type="button"
        onClick={() =>
          canvas.current!.getContext('2d')!.clearRect(0, 0, 480, 160)
        }
      >
        Clear signature
      </button>
      <button
        type="button"
        onClick={() =>
          canvas.current!.toBlob(
            (blob) => blob && void store(blob),
            'image/png',
          )
        }
      >
        Save signature
      </button>
    </div>
  );
}
