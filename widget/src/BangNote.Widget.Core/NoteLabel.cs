namespace BangNote.Widget.Core;

public static class NoteLabel
{
    public static string Number(int position, int sub) => sub > 0 ? $"{position}.{sub}" : $"{position}";

    /// <summary>"Đã lưu — Temp #5.3"; server cũ (không có position) → "Đã lưu".</summary>
    public static string Saved(NoteDto note) =>
        note.Position > 0 && note.Tags.Count > 0 ? $"Đã lưu — {note.Tags[0].Name} #{Number(note.Position, note.Sub)}" : "Đã lưu";

    /// <summary>Mỗi ghi chú chỉ 1 tag: bấm tag khác → gửi đúng tag đó; bấm tag hiện tại → null (không gửi).</summary>
    public static int[]? TagIdsForPick(NoteDto note, int clickedTagId) =>
        note.Tags.Count > 0 && note.Tags[0].Id == clickedTagId ? null : [clickedTagId];
}
