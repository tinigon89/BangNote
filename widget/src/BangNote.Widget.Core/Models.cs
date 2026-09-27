namespace BangNote.Widget.Core;

public sealed record TagDto(int Id, string Name, string Color, bool IsDefault);

public sealed record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags);

public sealed record QueuedNote(string Content, DateTimeOffset QueuedAt);

public sealed class WidgetSettings
{
    public string ServerUrl { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public double? Left { get; set; }
    public double? Top { get; set; }

    public bool IsConfigured => ServerUrl.Length > 0 && ApiKey.Length > 0;
}
