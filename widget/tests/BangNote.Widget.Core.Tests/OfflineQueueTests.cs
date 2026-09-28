namespace BangNote.Widget.Core.Tests;

public sealed class OfflineQueueTests : IDisposable
{
    private readonly TempDir _dir = new();
    private string QueuePath => _dir.File("queue.json");
    private static QueuedNote Note(string content) => new(content, DateTimeOffset.UnixEpoch);

    public void Dispose() => _dir.Dispose();

    [Fact]
    public void MissingFile_IsEmpty()
    {
        var queue = new OfflineQueue(QueuePath);
        Assert.Equal(0, queue.Count);
        Assert.Null(queue.Peek());
    }

    [Fact]
    public void Enqueue_PersistsAcrossInstances_InOrder()
    {
        var queue = new OfflineQueue(QueuePath);
        queue.Enqueue(Note("một"));
        queue.Enqueue(Note("hai"));

        var reloaded = new OfflineQueue(QueuePath);
        Assert.Equal(2, reloaded.Count);
        Assert.Equal("một", reloaded.Peek()!.Content);
    }

    [Fact]
    public void RemoveFirst_RemovesOldest_AndPersists()
    {
        var queue = new OfflineQueue(QueuePath);
        queue.Enqueue(Note("một"));
        queue.Enqueue(Note("hai"));
        queue.RemoveFirst();

        Assert.Equal("hai", new OfflineQueue(QueuePath).Peek()!.Content);
        queue.RemoveFirst();
        queue.RemoveFirst(); // rỗng → không làm gì
        Assert.Equal(0, new OfflineQueue(QueuePath).Count);
    }

    [Fact]
    public void CorruptFile_StartsEmpty_AndIsMovedAside()
    {
        Directory.CreateDirectory(_dir.Path);
        File.WriteAllText(QueuePath, "{không phải json");

        var queue = new OfflineQueue(QueuePath);

        Assert.Equal(0, queue.Count);
        Assert.True(File.Exists(QueuePath + ".bad"));
        queue.Enqueue(Note("mới"));
        Assert.Equal(1, new OfflineQueue(QueuePath).Count);
    }

    [Fact]
    public void NoTempFileLeftBehind()
    {
        new OfflineQueue(QueuePath).Enqueue(Note("x"));
        Assert.False(File.Exists(QueuePath + ".tmp"));
    }

    [Fact]
    public void OldQueueFileWithoutNewPost_LoadsAsComment()
    {
        Directory.CreateDirectory(_dir.Path);
        File.WriteAllText(QueuePath, """[{"content":"a","queuedAt":"2026-01-01T00:00:00+00:00"}]""");

        var item = new OfflineQueue(QueuePath).Peek()!;

        Assert.Equal("a", item.Content);
        Assert.False(item.NewPost);
    }
}
