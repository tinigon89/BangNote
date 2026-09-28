using System.Net;
using System.Text;

namespace BangNote.Widget.Core.Tests;

public class ApiClientTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string? Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add((request, request.Content is null ? null : await request.Content.ReadAsStringAsync(ct)));
            return await respond(request, ct);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, string json) =>
        new(code) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static (ApiClient Client, FakeHandler Handler) Create(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond, TimeSpan? timeout = null)
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { Timeout = timeout ?? TimeSpan.FromSeconds(5) };
        return (new ApiClient(http, "https://x.test/", "key-1"), handler);
    }

    [Fact]
    public async Task GetTags_SendsBearer_AndParsesCamelCase()
    {
        var (client, handler) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """[{"id":1,"name":"Chưa phân loại","color":"#94a3b8","isDefault":true}]""")));

        var tags = await client.GetTagsAsync();

        Assert.Equal(new[] { new TagDto(1, "Chưa phân loại", "#94a3b8", true) }, tags);
        var (request, _) = handler.Requests.Single();
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("https://x.test/api/tags", request.RequestUri!.ToString());
        Assert.Equal("Bearer key-1", request.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task CreateNote_PostsWidgetSource_AndParsesNote()
    {
        var (client, handler) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.Created,
            """{"id":7,"content":"hi","source":"widget","position":4,"tags":[{"id":1,"name":"Chưa phân loại","color":"#94a3b8","isDefault":true}]}""")));

        var note = await client.CreateNoteAsync("hi");

        Assert.Equal(7, note.Id);
        Assert.Equal(4, note.Position);
        Assert.Equal("Chưa phân loại", note.Tags.Single().Name);
        var (request, body) = handler.Requests.Single();
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("""{"content":"hi","source":"widget"}""", body);
    }

    [Fact]
    public async Task SetNoteTags_PutsTagIds_AndReturnsTags()
    {
        var (client, handler) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """{"id":7,"tags":[{"id":2,"name":"Lịch sử","color":"#ef4444","isDefault":false}],"position":5}""")));

        var placement = await client.SetNoteTagsAsync(7, [2, 3]);

        Assert.Equal("Lịch sử", placement.Tags.Single().Name);
        Assert.Equal(5, placement.Position);
        var (request, body) = handler.Requests.Single();
        Assert.Equal(HttpMethod.Put, request.Method);
        Assert.Equal("https://x.test/api/notes/7/tags", request.RequestUri!.ToString());
        Assert.Equal("""{"tagIds":[2,3]}""", body);
    }

    [Fact]
    public async Task Status401_IsRejected_WithServerMessage()
    {
        var (client, _) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.Unauthorized, """{"error":"API key không hợp lệ"}""")));
        var ex = await Assert.ThrowsAsync<ApiRejectedException>(() => client.GetTagsAsync());
        Assert.Equal(401, ex.StatusCode);
        Assert.Equal("API key không hợp lệ", ex.Message);
    }

    [Fact]
    public async Task HtmlErrorBody_IsRejected_WithStatusMessage()
    {
        var (client, _) = Create((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("<html>404</html>", Encoding.UTF8, "text/html"),
        }));
        var ex = await Assert.ThrowsAsync<ApiRejectedException>(() => client.CreateNoteAsync("x"));
        Assert.Equal("Lỗi 404", ex.Message);
    }

    [Fact]
    public async Task Status503_IsUnavailable() =>
        await Assert.ThrowsAsync<ApiUnavailableException>(() =>
            Create((_, _) => Task.FromResult(Json(HttpStatusCode.ServiceUnavailable, "{}"))).Client.CreateNoteAsync("x"));

    [Fact]
    public async Task NetworkError_IsUnavailable() =>
        await Assert.ThrowsAsync<ApiUnavailableException>(() =>
            Create((_, _) => throw new HttpRequestException("DNS")).Client.CreateNoteAsync("x"));

    [Fact]
    public async Task Timeout_IsUnavailable()
    {
        var (client, _) = Create(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            return Json(HttpStatusCode.OK, "{}");
        }, timeout: TimeSpan.FromMilliseconds(100));
        await Assert.ThrowsAsync<ApiUnavailableException>(() => client.CreateNoteAsync("x"));
    }

    [Fact]
    public void InvalidUrl_Throws() =>
        Assert.Throws<ArgumentException>(() => new ApiClient(new HttpClient(), "not a url", "k"));
}
