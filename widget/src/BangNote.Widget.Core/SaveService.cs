namespace BangNote.Widget.Core;

public abstract record SaveResult
{
    public sealed record Saved(NoteDto Note) : SaveResult;
    public sealed record Queued(int Pending, string? Reason = null) : SaveResult;
    public sealed record Rejected(string Message) : SaveResult;
}

public sealed record FlushResult(int Sent, int Dropped, bool Blocked);

public sealed class SaveService(OfflineQueue queue, Func<DateTimeOffset>? now = null)
{
    public const int MaxContent = 20000;
    private readonly Func<DateTimeOffset> _now = now ?? (() => DateTimeOffset.UtcNow);
    private readonly SemaphoreSlim _flushLock = new(1, 1);

    public IApiClient? Api { get; set; }

    public int Pending => queue.Count;

    /// <param name="newPost">Lưu thành bài mới (nút 📌 bật trước khi thả).</param>
    public async Task<SaveResult> SaveAsync(string text, bool newPost = false, CancellationToken ct = default)
    {
        var content = text.Trim();
        if (content.Length == 0) return new SaveResult.Rejected("Nội dung trống");
        if (content.Length > MaxContent) return new SaveResult.Rejected($"Nội dung tối đa {MaxContent} ký tự");

        var api = Api;
        if (api is null) return Enqueue(content, newPost, "Chưa cài đặt — đã giữ lại, sẽ gửi khi cài đặt xong");
        try
        {
            return new SaveResult.Saved(await api.CreateNoteAsync(content, newPost, ct));
        }
        catch (ApiUnavailableException)
        {
            return Enqueue(content, newPost, null);
        }
        catch (ApiRejectedException ex) when (ex.StatusCode == 401)
        {
            return Enqueue(content, newPost, "Sai API key — đã giữ lại, sẽ gửi khi sửa key");
        }
        catch (ApiRejectedException ex) when (IsContentRejection(ex))
        {
            return new SaveResult.Rejected(ex.Message);
        }
        catch (ApiRejectedException ex)
        {
            return Enqueue(content, newPost, $"Server từ chối ({ex.StatusCode}) — đã giữ lại, kiểm tra URL server");
        }
    }

    /// <summary>Chỉ các mã này nghĩa là chính nội dung bị từ chối — gửi lại cũng vô ích. Mã 4xx khác (sai URL, bị chặn, rate limit) có thể tự hết.</summary>
    private static bool IsContentRejection(ApiRejectedException ex) => ex.StatusCode is 400 or 413 or 422;

    private SaveResult.Queued Enqueue(string content, bool newPost, string? reason)
    {
        queue.Enqueue(new QueuedNote(content, _now(), newPost));
        return new SaveResult.Queued(queue.Count, reason);
    }

    /// <summary>Gửi lại hàng đợi theo thứ tự. Bỏ item có nội dung bị từ chối (400/413/422); dừng và giữ nguyên hàng đợi với mọi lỗi khác.</summary>
    public async Task<FlushResult> FlushAsync(CancellationToken ct = default)
    {
        var api = Api;
        if (api is null) return new FlushResult(0, 0, true);
        if (!await _flushLock.WaitAsync(0, ct)) return new FlushResult(0, 0, false);

        int sent = 0, dropped = 0;
        try
        {
            while (queue.Peek() is { } item)
            {
                try
                {
                    await api.CreateNoteAsync(item.Content, item.NewPost, ct);
                    queue.RemoveFirst();
                    sent++;
                }
                catch (ApiUnavailableException)
                {
                    return new FlushResult(sent, dropped, true);
                }
                catch (ApiRejectedException ex) when (IsContentRejection(ex))
                {
                    queue.RemoveFirst();
                    dropped++;
                }
                catch (ApiRejectedException)
                {
                    return new FlushResult(sent, dropped, true);
                }
            }
            return new FlushResult(sent, dropped, false);
        }
        finally
        {
            _flushLock.Release();
        }
    }
}
