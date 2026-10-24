'use client';

export function PrintButton() {
  return (
    <button type="button" className="vc-btn" onClick={() => window.print()}>
      พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
