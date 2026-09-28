namespace BangNote.Widget.Core;

public static class NoteLabel
{
    /// <summary>"Đã lưu — Temp #3"; server cũ (không có position) → "Đã lưu".</summary>
    public static string Saved(NoteDto note) =>
        note.Position > 0 && note.Tags.Count > 0 ? $"Đã lưu — {note.Tags[0].Name} #{note.Position}" : "Đã lưu";

    /// <summary>Mỗi ghi chú chỉ 1 tag: bấm tag khác → gửi đúng tag đó; bấm tag hiện tại → null (không gửi).</summary>
    public static int[]? TagIdsForPick(NoteDto note, int clickedTagId) =>
        note.Tags.Count > 0 && note.Tags[0].Id == clickedTagId ? null : [clickedTagId];
}
