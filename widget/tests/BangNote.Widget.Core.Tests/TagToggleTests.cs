namespace BangNote.Widget.Core.Tests;

public class TagToggleTests
{
    private static readonly TagDto Def = new(1, "Chưa phân loại", "#94a3b8", true);
    private static readonly TagDto Ls = new(2, "Lịch sử", "#ef4444", false);
    private static readonly TagDto Yh = new(3, "Y học", "#22c55e", false);

    [Fact] public void AddsRealTag_DroppingDefault() => Assert.Equal(new[] { 2 }, TagToggle.Toggle([Def], 2, 1));
    [Fact] public void AddsSecondTag() => Assert.Equal(new[] { 2, 3 }, TagToggle.Toggle([Ls], 3, 1));
    [Fact] public void RemovesSelectedTag() => Assert.Equal(new[] { 3 }, TagToggle.Toggle([Ls, Yh], 2, 1));
    [Fact] public void DefaultClearsAll() => Assert.Empty(TagToggle.Toggle([Ls, Yh], 1, 1));
}
