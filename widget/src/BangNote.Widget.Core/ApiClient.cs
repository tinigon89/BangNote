using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace BangNote.Widget.Core;

public sealed class ApiClient : IApiClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly string _apiKey;

    public ApiClient(HttpClient http, string serverUrl, string apiKey)
    {
        _http = http;
        _baseUrl = ServerUrl.Normalize(serverUrl);
        _apiKey = apiKey;
    }

    private sealed record ErrorResponse(string? Error);

    public Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default) =>
        SendAsync<IReadOnlyList<TagDto>>(HttpMethod.Get, "/api/tags", null, ct);

    public Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default) =>
        SendAsync<NoteDto>(HttpMethod.Post, "/api/notes", new { content, source = "widget" }, ct);

    public Task<TagPlacement> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
        SendAsync<TagPlacement>(HttpMethod.Put, $"/api/notes/{noteId}/tags", new { tagIds }, ct);

    public Task<TagPlacement> NewPostAsync(int noteId, CancellationToken ct = default) =>
        SendAsync<TagPlacement>(HttpMethod.Post, $"/api/notes/{noteId}/new-post", null, ct);

    private async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, _baseUrl + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        if (body is not null) request.Content = JsonContent.Create(body, options: Json);

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new ApiUnavailableException("Không kết nối được server", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new ApiUnavailableException("Server không phản hồi", ex);
        }

        using (response)
        {
            var status = (int)response.StatusCode;
            if (status >= 500) throw new ApiUnavailableException($"Server lỗi {status}");
            if (!response.IsSuccessStatusCode)
            {
                var message = $"Lỗi {status}";
                try
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>(Json, ct);
                    if (!string.IsNullOrWhiteSpace(error?.Error)) message = error.Error;
                }
                catch (Exception ex) when (ex is JsonException or NotSupportedException)
                {
                    // body không phải JSON (vd: trang 404 HTML) → giữ "Lỗi <status>"
                }
                throw new ApiRejectedException(status, message);
            }
            try
            {
                return await response.Content.ReadFromJsonAsync<T>(Json, ct)
                    ?? throw new ApiUnavailableException("Phản hồi rỗng từ server");
            }
            catch (Exception ex) when (ex is JsonException or NotSupportedException)
            {
                throw new ApiUnavailableException("Phản hồi không hợp lệ — kiểm tra URL server", ex);
            }
        }
    }
}
