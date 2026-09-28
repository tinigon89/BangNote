namespace BangNote.Widget.Core.Tests;

public class NoteLabelTests
{
    private static readonly TagDto Temp = new(1, "Temp", "#94a3b8", true);
    private static readonly TagDto Ls = new(2, "LichSu", "#a855f7", false);

    [Fact]
    public void Saved_ShowsTagAndNumber() =>
        Assert.Equal("Đã lưu — Temp #3", NoteLabel.Saved(new NoteDto(9, "x", [Temp], 3)));

    [Fact]
    public void Saved_OldServerWithoutPosition_ShowsPlainSaved() =>
        Assert.Equal("Đã lưu", NoteLabel.Saved(new NoteDto(9, "x", [Temp])));

    [Fact]
    public void Saved_NoTags_ShowsPlainSaved() =>
        Assert.Equal("Đã lưu", NoteLabel.Saved(new NoteDto(9, "x", [], 3)));

    [Fact]
    public void Pick_OtherTag_SendsOnlyThatTag() =>
        Assert.Equal(new[] { 2 }, NoteLabel.TagIdsForPick(new NoteDto(9, "x", [Temp], 1), 2));

    [Fact]
    public void Pick_CurrentTag_NoRequest() =>
        Assert.Null(NoteLabel.TagIdsForPick(new NoteDto(9, "x", [Ls], 1), 2));

    [Fact]
    public void Saved_Comment_ShowsPostDotComment() =>
        Assert.Equal("Đã lưu — Temp #5.3", NoteLabel.Saved(new NoteDto(9, "x", [Temp], 5, 3)));

    [Fact]
    public void Number_Formats() => Assert.Equal(("5", "5.2"), (NoteLabel.Number(5, 0), NoteLabel.Number(5, 2)));
}
