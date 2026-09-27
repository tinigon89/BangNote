namespace BangNote.Widget.Core;

public sealed class TagCache(
    Func<CancellationToken, Task<IReadOnlyList<TagDto>>> fetch,
    TimeSpan ttl,
    Func<DateTimeOffset>? now = null)
{
    private readonly Func<DateTimeOffset> _now = now ?? (() => DateTimeOffset.UtcNow);
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;

    public IReadOnlyList<TagDto> Current { get; private set; } = [];

    public async Task<IReadOnlyList<TagDto>> GetAsync(CancellationToken ct = default)
    {
        if (_now() - _fetchedAt < ttl) return Current;
        try
        {
            Current = await fetch(ct);
            _fetchedAt = _now();
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            // giữ danh sách cũ
        }
        return Current;
    }

    public void Invalidate() => _fetchedAt = DateTimeOffset.MinValue;
}
