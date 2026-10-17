'use client';

/** The design's dialog asking what to do with unsaved edits when an admin
 *  form is closed (used by MasterForm and WorkshopForm). */
export function UnsavedDialog({
  saving,
  err,
  onSave,
  onDiscard,
  onStay,
  title = 'ยังไม่ได้บันทึก',
  msg = 'คุณมีข้อมูลที่แก้ไขแต่ยังไม่ได้กดบันทึก ต้องการบันทึกก่อนออกหรือไม่?',
  saveLabel = 'บันทึก แล้วออก',
}: {
  title?: string;
  msg?: string;
  saveLabel?: string;
  saving: boolean;
  err: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <div className="adm-dlg-scrim" onClick={onStay}>
      <div className="adm-dlg" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="unsaved-title">{title}</h3>
        <p>{msg}</p>
        {err && (
          <div className="adm-notice is-bad" style={{ marginBottom: 16 }}>
            {err}
          </div>
        )}
        <div className="adm-dlg-acts">
          <button type="button" onClick={onStay} className="adm-btn white">
            อยู่ต่อ
          </button>
          <button type="button" onClick={onDiscard} className="adm-btn danger">
            ออกโดยไม่บันทึก
          </button>
          <button type="button" disabled={saving} onClick={onSave} className="adm-btn teal">
            {saving ? 'กำลังบันทึก…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
