namespace BangNote.Widget.Core.Tests;

public class TagCacheTests
{
    private DateTimeOffset _now = new(2026, 9, 27, 12, 0, 0, TimeSpan.Zero);
    private int _calls;
    private Func<IReadOnlyList<TagDto>> _next = () => [new TagDto(1, "A", "#000000", true)];

    private TagCache Create() => new(_ =>
    {
        _calls++;
        return Task.FromResult(_next());
    }, TimeSpan.FromMinutes(10), () => _now);

    [Fact]
    public async Task CachesWithinTtl()
    {
        var cache = Create();
        await cache.GetAsync();
        _now = _now.AddMinutes(9);
        await cache.GetAsync();
        Assert.Equal(1, _calls);
    }

    [Fact]
    public async Task RefetchesAfterTtl_AndOnInvalidate()
    {
        var cache = Create();
        await cache.GetAsync();
        _now = _now.AddMinutes(11);
        await cache.GetAsync();
        cache.Invalidate();
        await cache.GetAsync();
        Assert.Equal(3, _calls);
    }

    [Fact]
    public async Task ApiFailure_ReturnsStaleTags()
    {
        var cache = Create();
        var first = await cache.GetAsync();
        _now = _now.AddMinutes(11);
        _next = () => throw new ApiUnavailableException("offline");

        Assert.Equal(first, await cache.GetAsync());
        Assert.Equal(first, cache.Current);
    }
}
