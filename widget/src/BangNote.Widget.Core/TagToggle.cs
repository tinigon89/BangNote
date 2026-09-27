namespace BangNote.Widget.Core;

public static class TagToggle
{
    /// <summary>Bấm tag mặc định → bỏ hết tag thật; bấm tag thật → bật/tắt tag đó.</summary>
    public static int[] Toggle(IReadOnlyList<TagDto> current, int tagId, int defaultTagId)
    {
        if (tagId == defaultTagId) return [];
        var real = current.Where(t => !t.IsDefault).Select(t => t.Id).ToList();
        return real.Contains(tagId) ? real.Where(id => id != tagId).ToArray() : [.. real, tagId];
    }
}
