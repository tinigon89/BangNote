namespace BangNote.Widget.Core;

public sealed record TagDto(int Id, string Name, string Color, bool IsDefault);

/// <summary>Position = số bài trong tag, Sub = số comment (0 = bài); 0 khi server cũ chưa trả trường này.</summary>
public sealed record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags, int Position = 0, int Sub = 0);

public sealed record TagPlacement(IReadOnlyList<TagDto> Tags, int Position, int Sub = 0);

public sealed record QueuedNote(string Content, DateTimeOffset QueuedAt);

public sealed class WidgetSettings
{
    public string ServerUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public double? Left { get; set; }
    public double? Top { get; set; }

    public bool IsConfigured => ServerUrl.Length > 0 && ApiKey.Length > 0;
}
