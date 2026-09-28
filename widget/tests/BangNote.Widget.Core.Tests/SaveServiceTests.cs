namespace BangNote.Widget.Core.Tests;

public sealed class SaveServiceTests : IDisposable
{
    private sealed class FakeApi : IApiClient
    {
        public Queue<Func<string, NoteDto>> Behaviors { get; } = new();
        public List<string> Created { get; } = [];

        public async Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default)
        {
            await Task.Yield();
            Created.Add(content);
            return Behaviors.Count > 0 ? Behaviors.Dequeue()(content) : new NoteDto(Created.Count, content, []);
        }

        public Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default) => throw new NotSupportedException();

        public Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
            throw new NotSupportedException();

        public Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private static Func<string, NoteDto> Offline => _ => throw new ApiUnavailableException("offline");
    private static Func<string, NoteDto> Status(int code) => _ => throw new ApiRejectedException(code, $"Lỗi {code}");

    private readonly TempDir _dir = new();
    private readonly FakeApi _api = new();
    private readonly OfflineQueue _queue;
    private readonly SaveService _service;

    public SaveServiceTests()
    {
        _queue = new OfflineQueue(_dir.File("queue.json"));
        _service = new SaveService(_queue) { Api = _api };
    }

    public void Dispose() => _dir.Dispose();

    [Fact]
    public async Task Saves_TrimmedText()
    {
        var result = await _service.SaveAsync("  xin chào \r\n");
        var saved = Assert.IsType<SaveResult.Saved>(result);
        Assert.Equal("xin chào", saved.Note.Content);
        Assert.Equal(new[] { "xin chào" }, _api.Created);
    }

    [Theory]
    [InlineData("   \t\n")]
    [InlineData("")]
    public async Task EmptyText_IsRejected_WithoutCallingApi(string text)
    {
        Assert.IsType<SaveResult.Rejected>(await _service.SaveAsync(text));
        Assert.Empty(_api.Created);
    }

    [Fact]
    public async Task TooLong_IsRejected_WithoutCallingApi()
    {
        Assert.IsType<SaveResult.Rejected>(await _service.SaveAsync(new string('a', 20001)));
        Assert.Empty(_api.Created);
    }

    [Fact]
    public async Task Offline_IsQueued()
    {
        _api.Behaviors.Enqueue(Offline);
        var queued = Assert.IsType<SaveResult.Queued>(await _service.SaveAsync("x"));
        Assert.Equal(1, queued.Pending);
        Assert.Null(queued.Reason);
        Assert.Equal("x", _queue.Peek()!.Content);
    }

    [Fact]
    public async Task WrongApiKey_IsQueued_WithReason()
    {
        _api.Behaviors.Enqueue(Status(401));
        var queued = Assert.IsType<SaveResult.Queued>(await _service.SaveAsync("x"));
        Assert.Contains("API key", queued.Reason);
        Assert.Equal(1, _queue.Count);
    }

    [Fact]
    public async Task BadRequest_IsRejected_NotQueued()
    {
        _api.Behaviors.Enqueue(Status(400));
        var rejected = Assert.IsType<SaveResult.Rejected>(await _service.SaveAsync("x"));
        Assert.Equal("Lỗi 400", rejected.Message);
        Assert.Equal(0, _queue.Count);
    }

    [Fact]
    public async Task NotConfigured_IsQueued()
    {
        _service.Api = null;
        var queued = Assert.IsType<SaveResult.Queued>(await _service.SaveAsync("x"));
        Assert.Contains("cài đặt", queued.Reason);
    }

    [Fact]
    public async Task Flush_SendsInOrder_AndStopsWhenOffline()
    {
        foreach (var c in new[] { "1", "2", "3" }) _queue.Enqueue(new QueuedNote(c, DateTimeOffset.UnixEpoch));
        _api.Behaviors.Enqueue(c => new NoteDto(1, c, []));
        _api.Behaviors.Enqueue(Offline);

        var result = await _service.FlushAsync();

        Assert.Equal(new FlushResult(Sent: 1, Dropped: 0, Blocked: true), result);
        Assert.Equal(new[] { "1", "2" }, _api.Created);
        Assert.Equal(2, _queue.Count);
        Assert.Equal("2", _queue.Peek()!.Content);
    }

    [Fact]
    public async Task Flush_DropsBadRequests_AndContinues()
    {
        _queue.Enqueue(new QueuedNote("bad", DateTimeOffset.UnixEpoch));
        _queue.Enqueue(new QueuedNote("good", DateTimeOffset.UnixEpoch));
        _api.Behaviors.Enqueue(Status(400));

        Assert.Equal(new FlushResult(Sent: 1, Dropped: 1, Blocked: false), await _service.FlushAsync());
        Assert.Equal(0, _queue.Count);
    }

    [Fact]
    public async Task Flush_StopsOnWrongKey_KeepingQueue()
    {
        _queue.Enqueue(new QueuedNote("x", DateTimeOffset.UnixEpoch));
        _api.Behaviors.Enqueue(Status(401));

        Assert.True((await _service.FlushAsync()).Blocked);
        Assert.Equal(1, _queue.Count);
    }

    [Theory]
    [InlineData(403)]
    [InlineData(404)]
    [InlineData(405)]
    [InlineData(429)]
    public async Task Flush_StopsOnNonContentRejection_KeepingQueue(int status)
    {
        _queue.Enqueue(new QueuedNote("x", DateTimeOffset.UnixEpoch));
        _api.Behaviors.Enqueue(Status(status));

        var result = await _service.FlushAsync();

        Assert.True(result.Blocked);
        Assert.Equal(0, result.Dropped);
        Assert.Equal(1, _queue.Count);
    }

    [Theory]
    [InlineData(404)]
    [InlineData(429)]
    public async Task Save_NonContentRejection_IsQueued_WithReason(int status)
    {
        _api.Behaviors.Enqueue(Status(status));
        var queued = Assert.IsType<SaveResult.Queued>(await _service.SaveAsync("x"));
        Assert.Contains($"{status}", queued.Reason);
        Assert.Equal(1, _queue.Count);
    }

    [Fact]
    public async Task Flush_WithoutApi_DoesNothing()
    {
        _queue.Enqueue(new QueuedNote("x", DateTimeOffset.UnixEpoch));
        _service.Api = null;
        Assert.Equal(new FlushResult(0, 0, true), await _service.FlushAsync());
        Assert.Equal(1, _queue.Count);
    }
}
