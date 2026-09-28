namespace BangNote.Widget.Core;

public interface IApiClient
{
    Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default);
    Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default);
    Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default);
    Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default);
}
