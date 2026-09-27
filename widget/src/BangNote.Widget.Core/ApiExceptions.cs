namespace BangNote.Widget.Core;

/// <summary>Lỗi tạm thời (mạng, timeout, 5xx) — nên thử lại sau.</summary>
public sealed class ApiUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Server từ chối (4xx) — thử lại y hệt cũng sẽ lỗi.</summary>
public sealed class ApiRejectedException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
