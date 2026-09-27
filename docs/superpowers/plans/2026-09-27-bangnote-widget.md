# BangNote Widget (Windows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ô widget nổi trên Windows 10/11: kéo thả (hoặc `Ctrl+V`) chữ vào là lưu lên BangNote, hiện nút tag 5 giây để chuyển tag nhanh, tự giữ ghi chú trong hàng đợi khi mất mạng.

**Architecture:** Hai project. `BangNote.Widget.Core` (class library) chứa mọi logic test được: `ApiClient`, `OfflineQueue`, `SettingsStore`, `TagCache`, `SaveService`, `TagToggle`, `ServerUrl`. `BangNote.Widget` (WPF) chỉ lo hiển thị, kéo thả, khay hệ thống, registry khởi động. Test xUnit chỉ nhắm vào Core.

**Tech Stack:** .NET 8 (`net8.0-windows`), WPF + `System.Windows.Forms.NotifyIcon`, `System.Text.Json`, `System.Security.Cryptography.ProtectedData` 8.0.0 (DPAPI), xUnit.

**Spec:** `docs/superpowers/specs/2026-09-27-bangnote-design.md` (§8). Hợp đồng API: §4.1.

**Phụ thuộc:** Plan Web Task 5 (REST API) cho phần test tay; unit test chạy độc lập.

## Global Constraints

- Mọi lệnh `dotnet` chạy trong `widget/`. SDK 8.0.2xx (máy dev: 8.0.206), runtime Windows Desktop 8.
- API: `GET /api/tags`, `POST /api/notes` body `{"content": "...", "source": "widget"}`, `PUT /api/notes/{id}/tags` body `{"tagIds": [..]}` → `{id, tags}`; header `Authorization: Bearer <key>`; lỗi → `{"error": "..."}`. JSON camelCase.
- Nội dung trim; rỗng → không gửi; > 20 000 ký tự → không gửi.
- Dữ liệu: `%AppData%\BangNote\settings.json` (API key mã hoá DPAPI, scope CurrentUser) và `%AppData%\BangNote\queue.json`. Ghi file atomic (file `.tmp` rồi `File.Move(..., overwrite: true)`).
- Hàng đợi: lỗi mạng / timeout / 5xx → vào hàng đợi; gửi lại mỗi 60 giây theo thứ tự. 400/404… khi gửi lại → bỏ item đó. 401 → dừng, giữ nguyên hàng đợi.
- **Điều chỉnh so với spec §8:** spec nói "4xx → không vào hàng đợi". Plan này giữ nguyên cho 400 (nội dung sai, gửi lại cũng vô ích) nhưng **401 (sai API key) thì vẫn vào hàng đợi**, để chữ không bị mất trong lúc bạn sửa key; widget báo đỏ "Sai API key — đã giữ lại…". Task 4 cập nhật spec.
- Project WPF tắt `ImplicitUsings` (WinForms + WPF cùng lúc gây trùng tên `Application`, `MessageBox`…); dùng alias `Forms = System.Windows.Forms`.
- Chuỗi hiển thị bằng tiếng Việt.

## Review Focus

1. **`queue.json` hỏng** (tắt máy đột ngột, sửa tay) → widget vẫn chạy với hàng đợi rỗng, file hỏng được đổi thành `queue.json.bad` — test ở Task 1.
2. **`settings.json` chép từ máy khác / DPAPI giải mã lỗi** → coi như chưa cấu hình và mở hộp thoại Cài đặt, không crash — test ở Task 1.
3. **URL server có `/` cuối hoặc thiếu scheme** → chuẩn hoá hoặc báo lỗi trong hộp thoại — test ở Task 1.
4. **Sai API key lúc thả chữ** → chữ vào hàng đợi, không mất — test ở Task 2.
5. **Server trả HTML** (trang 404 Vercel khi URL sai) → thông báo "Lỗi 404", không crash vì JSON parse — test ở Task 2.

---

## File Structure

```
widget/
  BangNote.Widget.sln
  src/BangNote.Widget.Core/
    BangNote.Widget.Core.csproj
    Models.cs              TagDto, NoteDto, QueuedNote, WidgetSettings
    ServerUrl.cs           ServerUrl.Normalize
    ApiExceptions.cs       ApiUnavailableException, ApiRejectedException
    IApiClient.cs
    ApiClient.cs
    OfflineQueue.cs
    SettingsStore.cs
    TagCache.cs
    TagToggle.cs
    SaveService.cs         SaveResult, FlushResult, SaveService
  src/BangNote.Widget/
    BangNote.Widget.csproj
    App.xaml · App.xaml.cs
    MainWindow.xaml · MainWindow.xaml.cs
    SettingsWindow.xaml · SettingsWindow.xaml.cs
    TrayIcon.cs
    StartupRegistration.cs
  tests/BangNote.Widget.Core.Tests/
    BangNote.Widget.Core.Tests.csproj
    TempDir.cs
    ServerUrlTests.cs · OfflineQueueTests.cs · SettingsStoreTests.cs
    TagCacheTests.cs · TagToggleTests.cs
    ApiClientTests.cs · SaveServiceTests.cs
```

---

### Task 1: Solution + lưu trữ cục bộ (ServerUrl, OfflineQueue, SettingsStore, TagToggle)

**Files:**
- Create: `widget/BangNote.Widget.sln`, `widget/src/BangNote.Widget.Core/BangNote.Widget.Core.csproj`, `widget/tests/BangNote.Widget.Core.Tests/BangNote.Widget.Core.Tests.csproj`
- Create: `Models.cs`, `ServerUrl.cs`, `ApiExceptions.cs`, `OfflineQueue.cs`, `SettingsStore.cs`, `TagToggle.cs` (trong Core)
- Test: `TempDir.cs`, `ServerUrlTests.cs`, `OfflineQueueTests.cs`, `SettingsStoreTests.cs`, `TagToggleTests.cs`
- Create: `widget/.gitignore`

**Interfaces:**
- Produces (namespace `BangNote.Widget.Core`):
  - `record TagDto(int Id, string Name, string Color, bool IsDefault)`
  - `record NoteDto(int Id, string Content, IReadOnlyList<TagDto> Tags)`
  - `record QueuedNote(string Content, DateTimeOffset QueuedAt)`
  - `class WidgetSettings { string ServerUrl; string ApiKey; double? Left; double? Top; bool IsConfigured }`
  - `static class ServerUrl { string Normalize(string input) }` — ném `ArgumentException` (thông điệp tiếng Việt).
  - `class ApiUnavailableException(string message, Exception? inner = null)`, `class ApiRejectedException(int statusCode, string message) { int StatusCode }`
  - `class OfflineQueue(string path) { int Count; QueuedNote? Peek(); void Enqueue(QueuedNote); void RemoveFirst() }`
  - `class SettingsStore(string path) { WidgetSettings? Load(); void Save(WidgetSettings) }`
  - `static class TagToggle { int[] Toggle(IReadOnlyList<TagDto> current, int tagId, int defaultTagId) }`

- [ ] **Step 1: Tạo solution và project**

Run (trong `widget/`):
```bash
dotnet new sln -n BangNote.Widget
dotnet new classlib -n BangNote.Widget.Core -o src/BangNote.Widget.Core -f net8.0
dotnet new xunit -n BangNote.Widget.Core.Tests -o tests/BangNote.Widget.Core.Tests -f net8.0
rm -f src/BangNote.Widget.Core/Class1.cs tests/BangNote.Widget.Core.Tests/UnitTest1.cs
dotnet sln add src/BangNote.Widget.Core tests/BangNote.Widget.Core.Tests
dotnet add tests/BangNote.Widget.Core.Tests reference src/BangNote.Widget.Core
dotnet add src/BangNote.Widget.Core package System.Security.Cryptography.ProtectedData --version 8.0.0
```

Sửa `src/BangNote.Widget.Core/BangNote.Widget.Core.csproj` và `tests/BangNote.Widget.Core.Tests/BangNote.Widget.Core.Tests.csproj`: đổi `<TargetFramework>net8.0</TargetFramework>` thành `<TargetFramework>net8.0-windows</TargetFramework>` (giữ nguyên các dòng khác template sinh ra). Trong csproj Core thêm vào `PropertyGroup`:
```xml
```

`widget/.gitignore`:
```
bin/
obj/
publish/
*.user
.vs/
```

Run: `dotnet build`
Expected: `Build succeeded` (0 lỗi).

- [ ] **Step 2: Viết test thất bại**

`tests/BangNote.Widget.Core.Tests/TempDir.cs`:
```csharp
namespace BangNote.Widget.Core.Tests;

public sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "bn-test-" + Guid.NewGuid().ToString("N"));

    public string File(string name) => System.IO.Path.Combine(Path, name);

    public void Dispose()
    {
        if (Directory.Exists(Path)) Directory.Delete(Path, recursive: true);
    }
}
```

`tests/BangNote.Widget.Core.Tests/ServerUrlTests.cs`:
```csharp
namespace BangNote.Widget.Core.Tests;

public class ServerUrlTests
{
    [Theory]
    [InlineData(" https://bangnote.vercel.app/ ", "https://bangnote.vercel.app")]
    [InlineData("https://a.b/sub///", "https://a.b/sub")]
    [InlineData("http://localhost:3000", "http://localhost:3000")]
    [InlineData("https://a.b/?x=1#y", "https://a.b")]
    public void Normalizes(string input, string expected) => Assert.Equal(expected, ServerUrl.Normalize(input));

    [Theory]
    [InlineData("bangnote.vercel.app")]
    [InlineData("ftp://a.b")]
    [InlineData("")]
    public void RejectsInvalid(string input) => Assert.Throws<ArgumentException>(() => ServerUrl.Normalize(input));
}
```

`tests/BangNote.Widget.Core.Tests/OfflineQueueTests.cs`:
```csharp
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
}
```

`tests/BangNote.Widget.Core.Tests/SettingsStoreTests.cs`:
```csharp
using System.Text.Json.Nodes;

namespace BangNote.Widget.Core.Tests;

public sealed class SettingsStoreTests : IDisposable
{
    private readonly TempDir _dir = new();
    private string SettingsPath => _dir.File("settings.json");

    public void Dispose() => _dir.Dispose();

    [Fact]
    public void Missing_ReturnsNull() => Assert.Null(new SettingsStore(SettingsPath).Load());

    [Fact]
    public void RoundTrip_AndKeyIsNotStoredInPlainText()
    {
        var store = new SettingsStore(SettingsPath);
        store.Save(new WidgetSettings { ServerUrl = "https://a.b", ApiKey = "bi-mat-123", Left = 10, Top = 20.5 });

        var loaded = new SettingsStore(SettingsPath).Load()!;
        Assert.Equal("https://a.b", loaded.ServerUrl);
        Assert.Equal("bi-mat-123", loaded.ApiKey);
        Assert.Equal(10, loaded.Left);
        Assert.Equal(20.5, loaded.Top);
        Assert.True(loaded.IsConfigured);
        Assert.DoesNotContain("bi-mat-123", File.ReadAllText(SettingsPath));
    }

    [Fact]
    public void CorruptJson_ReturnsNull()
    {
        Directory.CreateDirectory(_dir.Path);
        File.WriteAllText(SettingsPath, "not json");
        Assert.Null(new SettingsStore(SettingsPath).Load());
    }

    [Fact]
    public void KeyThatCannotBeDecrypted_ReturnsNull()
    {
        var store = new SettingsStore(SettingsPath);
        store.Save(new WidgetSettings { ServerUrl = "https://a.b", ApiKey = "k" });
        var json = JsonNode.Parse(File.ReadAllText(SettingsPath))!;
        json["apiKeyProtected"] = Convert.ToBase64String(new byte[64]);
        File.WriteAllText(SettingsPath, json.ToJsonString());

        Assert.Null(new SettingsStore(SettingsPath).Load());
    }

    [Fact]
    public void EmptySettings_AreNotConfigured() => Assert.False(new WidgetSettings().IsConfigured);
}
```

`tests/BangNote.Widget.Core.Tests/TagToggleTests.cs`:
```csharp
namespace BangNote.Widget.Core.Tests;

public class TagToggleTests
{
    private static readonly TagDto Def = new(1, "Chưa phân loại", "#94a3b8", true);
    private static readonly TagDto Ls = new(2, "Lịch sử", "#ef4444", false);
    private static readonly TagDto Yh = new(3, "Y học", "#22c55e", false);

    [Fact] public void AddsRealTag_DroppingDefault() => Assert.Equal(new[] { 2 }, TagToggle.Toggle([Def], 2, 1));
    [Fact] public void AddsSecondTag() => Assert.Equal(new[] { 2, 3 }, TagToggle.Toggle([Ls], 3, 1));
    [Fact] public void RemovesSelectedTag() => Assert.Equal(new[] { 3 }, TagToggle.Toggle([Ls, Yh], 2, 1));
    [Fact] public void DefaultClearsAll() => Assert.Empty(TagToggle.Toggle([Ls, Yh], 1, 1));
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `dotnet test`
Expected: FAIL biên dịch — `The type or namespace name 'ServerUrl' could not be found` (và các kiểu khác).

- [ ] **Step 4: Cài đặt**

`src/BangNote.Widget.Core/Models.cs`:
```csharp
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
```

`src/BangNote.Widget.Core/ServerUrl.cs`:
```csharp
namespace BangNote.Widget.Core;

public static class ServerUrl
{
    public static string Normalize(string input)
    {
        if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new ArgumentException("URL phải bắt đầu bằng http:// hoặc https:// (vd: https://bangnote.vercel.app)");
        }
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
```

`src/BangNote.Widget.Core/ApiExceptions.cs`:
```csharp
namespace BangNote.Widget.Core;

/// <summary>Lỗi tạm thời (mạng, timeout, 5xx) — nên thử lại sau.</summary>
public sealed class ApiUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Server từ chối (4xx) — thử lại y hệt cũng sẽ lỗi.</summary>
public sealed class ApiRejectedException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
```

`src/BangNote.Widget.Core/OfflineQueue.cs`:
```csharp
using System.Text.Json;

namespace BangNote.Widget.Core;

public sealed class OfflineQueue
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _path;
    private readonly List<QueuedNote> _items;
    private readonly object _lock = new();

    public OfflineQueue(string path)
    {
        _path = path;
        _items = Load(path);
    }

    public int Count
    {
        get { lock (_lock) return _items.Count; }
    }

    public QueuedNote? Peek()
    {
        lock (_lock) return _items.Count > 0 ? _items[0] : null;
    }

    public void Enqueue(QueuedNote note)
    {
        lock (_lock)
        {
            _items.Add(note);
            Save();
        }
    }

    public void RemoveFirst()
    {
        lock (_lock)
        {
            if (_items.Count == 0) return;
            _items.RemoveAt(0);
            Save();
        }
    }

    private void Save() => AtomicFile.WriteAllText(_path, JsonSerializer.Serialize(_items, Json));

    private static List<QueuedNote> Load(string path)
    {
        if (!File.Exists(path)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<QueuedNote>>(File.ReadAllText(path), Json) ?? [];
        }
        catch (JsonException)
        {
            File.Move(path, path + ".bad", overwrite: true);
            return [];
        }
    }
}

internal static class AtomicFile
{
    public static void WriteAllText(string path, string contents)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, contents);
        File.Move(tmp, path, overwrite: true);
    }
}
```

`src/BangNote.Widget.Core/SettingsStore.cs`:
```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BangNote.Widget.Core;

public sealed class SettingsStore(string path)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly byte[] Entropy = "BangNote.Widget"u8.ToArray();

    private sealed record Stored(string ServerUrl, string ApiKeyProtected, double? Left, double? Top);

    public WidgetSettings? Load()
    {
        if (!File.Exists(path)) return null;
        try
        {
            var stored = JsonSerializer.Deserialize<Stored>(File.ReadAllText(path), Json);
            if (stored is null) return null;
            return new WidgetSettings
            {
                ServerUrl = stored.ServerUrl,
                ApiKey = Unprotect(stored.ApiKeyProtected),
                Left = stored.Left,
                Top = stored.Top,
            };
        }
        catch (Exception ex) when (ex is JsonException or CryptographicException or FormatException or ArgumentNullException)
        {
            return null;
        }
    }

    public void Save(WidgetSettings settings)
    {
        var stored = new Stored(settings.ServerUrl, Protect(settings.ApiKey), settings.Left, settings.Top);
        AtomicFile.WriteAllText(path, JsonSerializer.Serialize(stored, Json));
    }

    private static string Protect(string plain) =>
        Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.CurrentUser));

    private static string Unprotect(string protectedBase64) =>
        Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(protectedBase64), Entropy, DataProtectionScope.CurrentUser));
}
```

`src/BangNote.Widget.Core/TagToggle.cs`:
```csharp
namespace BangNote.Widget.Core;

public static class TagToggle
{
    /// <summary>Bấm tag mặc định → bỏ hết tag thật; bấm tag thật → bật/tắt tag đó.</summary>
    public static int[] Toggle(IReadOnlyList<TagDto> current, int tagId, int defaultTagId)
    {
        if (tagId == defaultTagId) return [];
        var real = current.Where(t => !t.IsDefault).Select(t => t.Id).ToList();
        return real.Contains(tagId) ? real.Where(id => id != tagId).ToArray() : [.. real, tagId];
    }
}
```

- [ ] **Step 5: Chạy test**

Run: `dotnet test`
Expected: `Passed!` — toàn bộ test Task 1 xanh, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add widget
git commit -m "feat(widget): core settings store, offline queue, URL normalizer, tag toggle"
```

---

### Task 2: ApiClient, TagCache, SaveService

**Files:**
- Create: `IApiClient.cs`, `ApiClient.cs`, `TagCache.cs`, `SaveService.cs` (trong Core)
- Test: `ApiClientTests.cs`, `TagCacheTests.cs`, `SaveServiceTests.cs`

**Interfaces:**
- Consumes: `ServerUrl`, `TagDto`, `NoteDto`, `QueuedNote`, `OfflineQueue`, hai lớp exception.
- Produces:
  - `interface IApiClient { Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default); Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default); Task<IReadOnlyList<TagDto>> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default); }`
  - `class ApiClient(HttpClient http, string serverUrl, string apiKey) : IApiClient` — lỗi mạng/timeout/5xx/JSON hỏng khi 2xx → `ApiUnavailableException`; 4xx → `ApiRejectedException` (thông điệp lấy từ `{error}`, nếu không có thì `Lỗi <status>`).
  - `class TagCache(Func<CancellationToken, Task<IReadOnlyList<TagDto>>> fetch, TimeSpan ttl, Func<DateTimeOffset>? now = null) { IReadOnlyList<TagDto> Current; Task<IReadOnlyList<TagDto>> GetAsync(CancellationToken ct = default); void Invalidate() }` — lỗi API → trả danh sách cũ.
  - `abstract record SaveResult` với `SaveResult.Saved(NoteDto Note)`, `SaveResult.Queued(int Pending, string? Reason = null)`, `SaveResult.Rejected(string Message)`.
  - `record FlushResult(int Sent, int Dropped, bool Blocked)`
  - `class SaveService(OfflineQueue queue, Func<DateTimeOffset>? now = null) { IApiClient? Api { get; set; }; int Pending; Task<SaveResult> SaveAsync(string text, CancellationToken ct = default); Task<FlushResult> FlushAsync(CancellationToken ct = default) }`

- [ ] **Step 1: Viết test thất bại**

`tests/BangNote.Widget.Core.Tests/ApiClientTests.cs`:
```csharp
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
            """{"id":7,"content":"hi","source":"widget","tags":[{"id":1,"name":"Chưa phân loại","color":"#94a3b8","isDefault":true}]}""")));

        var note = await client.CreateNoteAsync("hi");

        Assert.Equal(7, note.Id);
        Assert.Equal("Chưa phân loại", note.Tags.Single().Name);
        var (request, body) = handler.Requests.Single();
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("""{"content":"hi","source":"widget"}""", body);
    }

    [Fact]
    public async Task SetNoteTags_PutsTagIds_AndReturnsTags()
    {
        var (client, handler) = Create((_, _) => Task.FromResult(Json(HttpStatusCode.OK,
            """{"id":7,"tags":[{"id":2,"name":"Lịch sử","color":"#ef4444","isDefault":false}]}""")));

        var tags = await client.SetNoteTagsAsync(7, [2, 3]);

        Assert.Equal("Lịch sử", tags.Single().Name);
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
```

`tests/BangNote.Widget.Core.Tests/TagCacheTests.cs`:
```csharp
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
```

`tests/BangNote.Widget.Core.Tests/SaveServiceTests.cs`:
```csharp
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

        public Task<IReadOnlyList<TagDto>> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
            throw new NotSupportedException();
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

    [Fact]
    public async Task Flush_WithoutApi_DoesNothing()
    {
        _queue.Enqueue(new QueuedNote("x", DateTimeOffset.UnixEpoch));
        _service.Api = null;
        Assert.Equal(new FlushResult(0, 0, true), await _service.FlushAsync());
        Assert.Equal(1, _queue.Count);
    }
}
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `dotnet test`
Expected: FAIL biên dịch — thiếu `ApiClient`, `IApiClient`, `TagCache`, `SaveService`.

- [ ] **Step 3: Cài đặt**

`src/BangNote.Widget.Core/IApiClient.cs`:
```csharp
namespace BangNote.Widget.Core;

public interface IApiClient
{
    Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default);
    Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default);
    Task<IReadOnlyList<TagDto>> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default);
}
```

`src/BangNote.Widget.Core/ApiClient.cs`:
```csharp
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

    private sealed record SetTagsResponse(int Id, IReadOnlyList<TagDto> Tags);
    private sealed record ErrorResponse(string? Error);

    public Task<IReadOnlyList<TagDto>> GetTagsAsync(CancellationToken ct = default) =>
        SendAsync<IReadOnlyList<TagDto>>(HttpMethod.Get, "/api/tags", null, ct);

    public Task<NoteDto> CreateNoteAsync(string content, CancellationToken ct = default) =>
        SendAsync<NoteDto>(HttpMethod.Post, "/api/notes", new { content, source = "widget" }, ct);

    public async Task<IReadOnlyList<TagDto>> SetNoteTagsAsync(int noteId, IReadOnlyList<int> tagIds, CancellationToken ct = default) =>
        (await SendAsync<SetTagsResponse>(HttpMethod.Put, $"/api/notes/{noteId}/tags", new { tagIds }, ct)).Tags;

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
```

`src/BangNote.Widget.Core/TagCache.cs`:
```csharp
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
```

`src/BangNote.Widget.Core/SaveService.cs`:
```csharp
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

    public async Task<SaveResult> SaveAsync(string text, CancellationToken ct = default)
    {
        var content = text.Trim();
        if (content.Length == 0) return new SaveResult.Rejected("Nội dung trống");
        if (content.Length > MaxContent) return new SaveResult.Rejected($"Nội dung tối đa {MaxContent} ký tự");

        var api = Api;
        if (api is null) return Enqueue(content, "Chưa cài đặt — đã giữ lại, sẽ gửi khi cài đặt xong");
        try
        {
            return new SaveResult.Saved(await api.CreateNoteAsync(content, ct));
        }
        catch (ApiUnavailableException)
        {
            return Enqueue(content, null);
        }
        catch (ApiRejectedException ex) when (ex.StatusCode == 401)
        {
            return Enqueue(content, "Sai API key — đã giữ lại, sẽ gửi khi sửa key");
        }
        catch (ApiRejectedException ex)
        {
            return new SaveResult.Rejected(ex.Message);
        }
    }

    private SaveResult.Queued Enqueue(string content, string? reason)
    {
        queue.Enqueue(new QueuedNote(content, _now()));
        return new SaveResult.Queued(queue.Count, reason);
    }

    /// <summary>Gửi lại hàng đợi theo thứ tự. Dừng khi mất mạng hoặc sai key; bỏ item bị server từ chối vì lý do khác.</summary>
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
                    await api.CreateNoteAsync(item.Content, ct);
                    queue.RemoveFirst();
                    sent++;
                }
                catch (ApiUnavailableException)
                {
                    return new FlushResult(sent, dropped, true);
                }
                catch (ApiRejectedException ex) when (ex.StatusCode == 401)
                {
                    return new FlushResult(sent, dropped, true);
                }
                catch (ApiRejectedException)
                {
                    queue.RemoveFirst();
                    dropped++;
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
```

- [ ] **Step 4: Chạy test**

Run: `dotnet test`
Expected: `Passed!`, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add widget
git commit -m "feat(widget): API client, tag cache and save service with offline queue"
```

---

### Task 3: Ứng dụng WPF (cửa sổ nổi, kéo thả, khay hệ thống, cài đặt)

**Files:**
- Create: `widget/src/BangNote.Widget/BangNote.Widget.csproj`, `App.xaml`, `App.xaml.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs`, `SettingsWindow.xaml`, `SettingsWindow.xaml.cs`, `TrayIcon.cs`, `StartupRegistration.cs`

**Interfaces:**
- Consumes: toàn bộ Core.
- Produces: `BangNote.Widget.exe`.
  - `App`: `static HttpClient Http`, `static string DataDir`, `WidgetSettings Settings`, `SettingsStore SettingsStore`, `SaveService SaveService`, `TagCache? Tags`, `void UpdateSettings(WidgetSettings)`, `void OpenSettings()`.
  - `MainWindow`: `void ToggleVisibility()`, `Task OnSettingsChangedAsync()`.
  - `StartupRegistration.IsEnabled()`, `StartupRegistration.SetEnabled(bool)`.

- [ ] **Step 1: Tạo project WPF**

Run (trong `widget/`):
```bash
dotnet new wpf -n BangNote.Widget -o src/BangNote.Widget -f net8.0
rm -f src/BangNote.Widget/MainWindow.xaml src/BangNote.Widget/MainWindow.xaml.cs src/BangNote.Widget/App.xaml src/BangNote.Widget/App.xaml.cs src/BangNote.Widget/AssemblyInfo.cs
dotnet sln add src/BangNote.Widget
dotnet add src/BangNote.Widget reference src/BangNote.Widget.Core
```

Ghi đè `src/BangNote.Widget/BangNote.Widget.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <UseWPF>true</UseWPF>
    <UseWindowsForms>true</UseWindowsForms>
    <AssemblyName>BangNote.Widget</AssemblyName>
    <RootNamespace>BangNote.Widget</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\BangNote.Widget.Core\BangNote.Widget.Core.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Registry khởi động và icon khay**

`src/BangNote.Widget/StartupRegistration.cs`:
```csharp
using System;
using Microsoft.Win32;

namespace BangNote.Widget;

public static class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "BangNote";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(ValueName) is string;
    }

    public static void SetEnabled(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled && Environment.ProcessPath is { } exe) key.SetValue(ValueName, $"\"{exe}\"");
        else key.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}
```

`src/BangNote.Widget/TrayIcon.cs`:
```csharp
using System;
using Drawing = System.Drawing;
using Forms = System.Windows.Forms;

namespace BangNote.Widget;

public sealed class TrayIcon : IDisposable
{
    private readonly Forms.NotifyIcon _icon;

    public TrayIcon(App app, MainWindow window)
    {
        var startupItem = new Forms.ToolStripMenuItem("Khởi động cùng Windows") { CheckOnClick = true };
        startupItem.CheckedChanged += (_, _) => StartupRegistration.SetEnabled(startupItem.Checked);

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Hiện / Ẩn", null, (_, _) => window.ToggleVisibility());
        menu.Items.Add("Cài đặt…", null, (_, _) => app.OpenSettings());
        menu.Items.Add(startupItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Thoát", null, (_, _) => app.Shutdown());
        menu.Opening += (_, _) => startupItem.Checked = StartupRegistration.IsEnabled();

        _icon = new Forms.NotifyIcon { Icon = CreateIcon(), Text = "BangNote", ContextMenuStrip = menu, Visible = true };
        _icon.MouseClick += (_, e) =>
        {
            if (e.Button == Forms.MouseButtons.Left) window.ToggleVisibility();
        };
    }

    private static Drawing.Icon CreateIcon()
    {
        using var bitmap = new Drawing.Bitmap(32, 32);
        using (var g = Drawing.Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var path = new Drawing.Drawing2D.GraphicsPath();
            path.AddArc(0, 0, 12, 12, 180, 90);
            path.AddArc(19, 0, 12, 12, 270, 90);
            path.AddArc(19, 19, 12, 12, 0, 90);
            path.AddArc(0, 19, 12, 12, 90, 90);
            path.CloseFigure();
            using var blue = new Drawing.SolidBrush(Drawing.Color.FromArgb(37, 99, 235));
            using var white = new Drawing.SolidBrush(Drawing.Color.White);
            g.FillPath(blue, path);
            g.FillRectangle(white, 9, 9, 14, 3);
            g.FillRectangle(white, 9, 15, 14, 3);
            g.FillRectangle(white, 9, 21, 9, 3);
        }
        return Drawing.Icon.FromHandle(bitmap.GetHicon());
    }

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
    }
}
```

- [ ] **Step 3: App**

`src/BangNote.Widget/App.xaml`:
```xml
<Application x:Class="BangNote.Widget.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             ShutdownMode="OnExplicitShutdown">
</Application>
```

`src/BangNote.Widget/App.xaml.cs`:
```csharp
using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Windows;
using System.Windows.Threading;
using BangNote.Widget.Core;

namespace BangNote.Widget;

public partial class App : Application
{
    public static readonly string DataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BangNote");

    public static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

    private Mutex? _mutex;
    private bool _ownsMutex;
    private TrayIcon? _tray;
    private MainWindow? _window;

    public SettingsStore SettingsStore { get; } = new(Path.Combine(DataDir, "settings.json"));
    public SaveService SaveService { get; } = new(new OfflineQueue(Path.Combine(DataDir, "queue.json")));
    public WidgetSettings Settings { get; private set; } = new();
    public TagCache? Tags { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _mutex = new Mutex(initiallyOwned: true, "BangNote.Widget.SingleInstance", out _ownsMutex);
        if (!_ownsMutex)
        {
            Shutdown();
            return;
        }
        DispatcherUnhandledException += OnUnhandledException;

        Settings = SettingsStore.Load() ?? new WidgetSettings();
        ApplySettings();

        _window = new MainWindow(this);
        _tray = new TrayIcon(this, _window);
        _window.Show();
        if (!Settings.IsConfigured) OpenSettings();
    }

    private void ApplySettings()
    {
        if (Settings.IsConfigured)
        {
            var api = new ApiClient(Http, Settings.ServerUrl, Settings.ApiKey);
            SaveService.Api = api;
            Tags = new TagCache(api.GetTagsAsync, TimeSpan.FromMinutes(10));
        }
        else
        {
            SaveService.Api = null;
            Tags = null;
        }
    }

    public void UpdateSettings(WidgetSettings settings)
    {
        Settings = settings;
        SettingsStore.Save(settings);
        ApplySettings();
    }

    public void OpenSettings()
    {
        var dialog = new SettingsWindow(this);
        if (_window is { IsVisible: true }) dialog.Owner = _window;
        if (dialog.ShowDialog() == true && _window is not null) _ = _window.OnSettingsChangedAsync();
    }

    private void OnUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            File.AppendAllText(Path.Combine(DataDir, "error.log"), $"{DateTimeOffset.Now:O} {e.Exception}\n");
        }
        catch (IOException)
        {
        }
        MessageBox.Show(e.Exception.Message, "BangNote — lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        if (_ownsMutex) _mutex?.ReleaseMutex();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
```

- [ ] **Step 4: Cửa sổ Cài đặt**

`src/BangNote.Widget/SettingsWindow.xaml`:
```xml
<Window x:Class="BangNote.Widget.SettingsWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Cài đặt BangNote" Width="400" SizeToContent="Height"
        ResizeMode="NoResize" WindowStartupLocation="CenterScreen">
  <StackPanel Margin="16">
    <TextBlock Text="URL server (vd: https://bangnote.vercel.app)" />
    <TextBox x:Name="UrlBox" Margin="0,4,0,12" Padding="4" />
    <TextBlock Text="API key" />
    <PasswordBox x:Name="KeyBox" Margin="0,4,0,12" Padding="4" />
    <CheckBox x:Name="StartupBox" Content="Khởi động cùng Windows" Margin="0,0,0,12" />
    <TextBlock x:Name="StatusText" TextWrapping="Wrap" Margin="0,0,0,12" />
    <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
      <Button Content="Kiểm tra" Width="84" Margin="0,0,8,0" Click="OnTest" />
      <Button Content="Lưu" Width="84" Margin="0,0,8,0" IsDefault="True" Click="OnSave" />
      <Button Content="Huỷ" Width="84" IsCancel="True" />
    </StackPanel>
  </StackPanel>
</Window>
```

`src/BangNote.Widget/SettingsWindow.xaml.cs`:
```csharp
using System;
using System.Windows;
using System.Windows.Media;
using BangNote.Widget.Core;

namespace BangNote.Widget;

public partial class SettingsWindow : Window
{
    private readonly App _app;

    public SettingsWindow(App app)
    {
        _app = app;
        InitializeComponent();
        UrlBox.Text = app.Settings.ServerUrl;
        KeyBox.Password = app.Settings.ApiKey;
        StartupBox.IsChecked = StartupRegistration.IsEnabled();
    }

    private void ShowStatus(string text, bool? ok)
    {
        StatusText.Text = text;
        StatusText.Foreground = ok switch
        {
            true => Brushes.Green,
            false => Brushes.Firebrick,
            null => Brushes.Black,
        };
    }

    private bool TryRead(out string url, out string key)
    {
        url = "";
        key = KeyBox.Password.Trim();
        try
        {
            url = ServerUrl.Normalize(UrlBox.Text);
        }
        catch (ArgumentException ex)
        {
            ShowStatus(ex.Message, false);
            return false;
        }
        if (key.Length == 0)
        {
            ShowStatus("Chưa nhập API key", false);
            return false;
        }
        return true;
    }

    private async void OnTest(object sender, RoutedEventArgs e)
    {
        if (!TryRead(out var url, out var key)) return;
        ShowStatus("Đang kiểm tra…", null);
        try
        {
            var tags = await new ApiClient(App.Http, url, key).GetTagsAsync();
            ShowStatus($"Kết nối OK — {tags.Count} tag", true);
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            ShowStatus(ex.Message, false);
        }
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        if (!TryRead(out var url, out var key)) return;
        var current = _app.Settings;
        _app.UpdateSettings(new WidgetSettings { ServerUrl = url, ApiKey = key, Left = current.Left, Top = current.Top });
        StartupRegistration.SetEnabled(StartupBox.IsChecked == true);
        DialogResult = true;
    }
}
```

- [ ] **Step 5: Cửa sổ widget**

`src/BangNote.Widget/MainWindow.xaml`:
```xml
<Window x:Class="BangNote.Widget.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="BangNote" Width="180" MinHeight="110" SizeToContent="Height"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize"
        AllowDrop="True"
        DragEnter="OnDragEnter" DragOver="OnDragOver" DragLeave="OnDragLeave" Drop="OnDrop"
        MouseLeftButtonDown="OnMouseDown" KeyDown="OnKeyDown">
  <Window.ContextMenu>
    <ContextMenu>
      <MenuItem Header="Cài đặt…" Click="OnSettingsClick" />
      <MenuItem Header="Ẩn" Click="OnHideClick" />
      <Separator />
      <MenuItem Header="Thoát" Click="OnExitClick" />
    </ContextMenu>
  </Window.ContextMenu>
  <Border x:Name="Card" CornerRadius="12" Padding="10" MinHeight="110" Background="#E61E293B">
    <StackPanel VerticalAlignment="Center">
      <TextBlock x:Name="StatusText" Text="Thả chữ vào đây" Foreground="White" FontSize="13"
                 TextWrapping="Wrap" TextAlignment="Center" />
      <WrapPanel x:Name="TagPanel" Visibility="Collapsed" Margin="0,8,0,0" HorizontalAlignment="Center" />
    </StackPanel>
  </Border>
</Window>
```

`src/BangNote.Widget/MainWindow.xaml.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using BangNote.Widget.Core;

namespace BangNote.Widget;

public partial class MainWindow : Window
{
    private static readonly Brush IdleBrush = ParseBrush("#E61E293B");
    private static readonly Brush DragBrush = ParseBrush("#E62563EB");
    private static readonly Brush OkBrush = ParseBrush("#E6166534");
    private static readonly Brush WarnBrush = ParseBrush("#E6C2410C");
    private static readonly Brush ErrorBrush = ParseBrush("#E6B91C1C");

    private readonly App _app;
    private readonly DispatcherTimer _revertTimer = new();
    private readonly DispatcherTimer _flushTimer = new() { Interval = TimeSpan.FromSeconds(60) };
    private Brush _restingBrush = IdleBrush;
    private NoteDto? _lastNote;

    public MainWindow(App app)
    {
        _app = app;
        InitializeComponent();
        PlaceWindow();
        _revertTimer.Tick += (_, _) => ShowIdle();
        _flushTimer.Tick += async (_, _) => await FlushAsync();
        _flushTimer.Start();
        Loaded += async (_, _) =>
        {
            ShowIdle();
            await FlushAsync();
        };
    }

    private static Brush ParseBrush(string hex)
    {
        var brush = (Brush)new BrushConverter().ConvertFromString(hex)!;
        brush.Freeze();
        return brush;
    }

    private void PlaceWindow()
    {
        if (_app.Settings.Left is double left && _app.Settings.Top is double top
            && left >= SystemParameters.VirtualScreenLeft
            && top >= SystemParameters.VirtualScreenTop
            && left + Width <= SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth
            && top + 60 <= SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight)
        {
            Left = left;
            Top = top;
            return;
        }
        var area = SystemParameters.WorkArea;
        Left = area.Right - Width - 24;
        Top = area.Bottom - 160;
    }

    public void ToggleVisibility()
    {
        if (IsVisible) Hide();
        else
        {
            Show();
            Activate();
        }
    }

    public async Task OnSettingsChangedAsync()
    {
        ShowIdle();
        await FlushAsync();
    }

    // ---------- trạng thái hiển thị ----------

    private void ShowIdle()
    {
        _revertTimer.Stop();
        TagPanel.Visibility = Visibility.Collapsed;
        var pending = _app.SaveService.Pending;
        if (!_app.Settings.IsConfigured) SetStatus("Chưa cài đặt — chuột phải để mở Cài đặt", ErrorBrush);
        else if (pending > 0) SetStatus($"Đang chờ gửi ({pending})", WarnBrush);
        else SetStatus("Thả chữ vào đây", IdleBrush);
    }

    private void SetStatus(string text, Brush brush)
    {
        StatusText.Text = text;
        Card.Background = brush;
        _restingBrush = brush;
    }

    private void ShowMessage(string text, Brush brush, TimeSpan revertAfter)
    {
        TagPanel.Visibility = Visibility.Collapsed;
        SetStatus(text, brush);
        RestartRevert(revertAfter);
    }

    private void RestartRevert(TimeSpan after)
    {
        _revertTimer.Stop();
        _revertTimer.Interval = after;
        _revertTimer.Start();
    }

    // ---------- lưu ----------

    private async Task SaveAsync(string text)
    {
        SetStatus("Đang lưu…", IdleBrush);
        switch (await _app.SaveService.SaveAsync(text))
        {
            case SaveResult.Saved saved:
                await ShowSavedAsync(saved.Note);
                break;
            case SaveResult.Queued queued:
                ShowMessage(queued.Reason ?? $"Mất mạng — đang chờ gửi ({queued.Pending})",
                    queued.Reason is null ? WarnBrush : ErrorBrush, TimeSpan.FromSeconds(4));
                break;
            case SaveResult.Rejected rejected:
                ShowMessage(rejected.Message, ErrorBrush, TimeSpan.FromSeconds(3));
                break;
        }
    }

    private async Task ShowSavedAsync(NoteDto note)
    {
        _lastNote = note;
        SetStatus($"Đã lưu #{note.Id}", OkBrush);
        IReadOnlyList<TagDto> tags = _app.Tags is { } cache ? await cache.GetAsync() : [];
        RenderTags(note, tags);
        RestartRevert(TimeSpan.FromSeconds(5));
    }

    private void RenderTags(NoteDto note, IReadOnlyList<TagDto> allTags)
    {
        TagPanel.Children.Clear();
        var selected = note.Tags.Select(t => t.Id).ToHashSet();
        foreach (var tag in allTags)
        {
            var isOn = selected.Contains(tag.Id);
            var button = new Button
            {
                Content = (isOn ? "✓ " : "") + tag.Name,
                Margin = new Thickness(2),
                Padding = new Thickness(6, 2, 6, 2),
                FontSize = 11,
                Foreground = Brushes.White,
                Background = ParseBrush(tag.Color),
                BorderBrush = Brushes.White,
                BorderThickness = new Thickness(isOn ? 2 : 0),
                Cursor = Cursors.Hand,
            };
            button.Click += async (_, _) => await ToggleTagAsync(tag);
            TagPanel.Children.Add(button);
        }
        TagPanel.Visibility = allTags.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private async Task ToggleTagAsync(TagDto tag)
    {
        if (_lastNote is not { } note || _app.SaveService.Api is not { } api || _app.Tags is not { } cache) return;
        RestartRevert(TimeSpan.FromSeconds(5));
        var defaultId = cache.Current.FirstOrDefault(t => t.IsDefault)?.Id ?? -1;
        try
        {
            var tags = await api.SetNoteTagsAsync(note.Id, TagToggle.Toggle(note.Tags, tag.Id, defaultId));
            _lastNote = note with { Tags = tags };
            RenderTags(_lastNote, cache.Current);
            RestartRevert(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            ShowMessage(ex.Message, ErrorBrush, TimeSpan.FromSeconds(3));
        }
    }

    private async Task FlushAsync()
    {
        if (_app.SaveService.Pending == 0) return;
        await _app.SaveService.FlushAsync();
        if (!_revertTimer.IsEnabled) ShowIdle();
    }

    // ---------- sự kiện ----------

    private static bool HasText(IDataObject data) =>
        data.GetDataPresent(DataFormats.UnicodeText) || data.GetDataPresent(DataFormats.Text);

    private void OnDragEnter(object sender, DragEventArgs e)
    {
        e.Effects = HasText(e.Data) ? DragDropEffects.Copy : DragDropEffects.None;
        if (e.Effects == DragDropEffects.Copy) Card.Background = DragBrush;
        e.Handled = true;
    }

    private void OnDragOver(object sender, DragEventArgs e)
    {
        e.Effects = HasText(e.Data) ? DragDropEffects.Copy : DragDropEffects.None;
        e.Handled = true;
    }

    private void OnDragLeave(object sender, DragEventArgs e) => Card.Background = _restingBrush;

    private async void OnDrop(object sender, DragEventArgs e)
    {
        e.Handled = true;
        var text = e.Data.GetData(DataFormats.UnicodeText) as string ?? e.Data.GetData(DataFormats.Text) as string;
        if (text is null)
        {
            ShowMessage("Chỉ nhận text", ErrorBrush, TimeSpan.FromSeconds(2));
            return;
        }
        await SaveAsync(text);
    }

    private async void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.V || Keyboard.Modifiers != ModifierKeys.Control) return;
        e.Handled = true;
        if (Clipboard.ContainsText()) await SaveAsync(Clipboard.GetText());
        else ShowMessage("Clipboard không có text", ErrorBrush, TimeSpan.FromSeconds(2));
    }

    private void OnMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState != MouseButtonState.Pressed) return;
        DragMove();
        _app.Settings.Left = Left;
        _app.Settings.Top = Top;
        _app.SettingsStore.Save(_app.Settings);
    }

    private void OnSettingsClick(object sender, RoutedEventArgs e) => _app.OpenSettings();

    private void OnHideClick(object sender, RoutedEventArgs e) => Hide();

    private void OnExitClick(object sender, RoutedEventArgs e) => _app.Shutdown();
}
```

- [ ] **Step 6: Build**

Run: `dotnet build`
Expected: `Build succeeded`, 0 error. (Nếu có cảnh báo trùng tên `Application`/`Brush` do WinForms, kiểm tra `ImplicitUsings` đang là `disable`.)

- [ ] **Step 7: Kiểm tra bằng tay (cần web chạy `npm run dev` với `API_KEY=dev-key`)**

Run: `dotnet run --project src/BangNote.Widget`
1. Lần đầu: hộp thoại Cài đặt tự mở. Nhập `localhost:3000` → *Kiểm tra* → báo lỗi URL. Nhập `http://localhost:3000/` + `dev-key` → *Kiểm tra* → "Kết nối OK — n tag" → *Lưu*.
2. Widget ở góc phải dưới, luôn nằm trên cùng. Kéo đến chỗ khác → tắt/mở lại app → vẫn ở chỗ mới.
3. Bôi đen chữ trong Chrome → kéo vào widget → nền xanh dương khi rê vào → thả → nền xanh lá "Đã lưu #n" + nút tag → bấm "Lịch sử" → nút có ✓ → trên web ghi chú mang tag Lịch sử, nguồn Widget. Không bấm gì → 5 giây sau về "Thả chữ vào đây".
4. Kéo chữ từ Word và Notepad → lưu được. Kéo một file từ Explorer → không có dấu `+` (không nhận).
5. Copy chữ → bấm vào widget → `Ctrl+V` → lưu.
6. Dừng web server → thả chữ → nền cam "Mất mạng — đang chờ gửi (1)"; chạy lại web → trong ≤ 60 giây ghi chú xuất hiện trên web, widget về "Thả chữ vào đây".
7. Đổi key sai trong Cài đặt → thả chữ → đỏ "Sai API key — đã giữ lại…"; sửa key đúng → *Lưu* → ghi chú được gửi.
8. Chạy exe lần hai → không mở cửa sổ thứ hai.
9. Icon khay: click trái ẩn/hiện; menu có "Khởi động cùng Windows" (bật → kiểm tra `regedit` `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BangNote`); *Thoát* đóng app và icon biến mất.
10. Tắt app, ghi `{hỏng` vào `%AppData%\BangNote\queue.json` → mở app → chạy bình thường, có file `queue.json.bad`.

- [ ] **Step 8: Chạy toàn bộ test + commit**

Run: `dotnet test`
Expected: `Passed!`.

```bash
git add widget
git commit -m "feat(widget): WPF floating drop target with tray icon, settings and quick tagging"
```

---

### Task 4: Đóng gói, tài liệu, cập nhật spec

**Files:**
- Modify: `README.md`, `docs/manual-test.md`, `docs/superpowers/specs/2026-09-27-bangnote-design.md`

- [ ] **Step 1: Build bản phát hành**

Run (trong `widget/`):
```bash
dotnet publish src/BangNote.Widget -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false -o publish
```
Expected: `publish/BangNote.Widget.exe` tồn tại (vài MB). Chạy thử file đó → widget mở bình thường, dùng lại cài đặt cũ.

- [ ] **Step 2: Thêm vào `README.md`**

````markdown
## Cài widget Windows

Cần [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (x64).

```bash
cd widget
dotnet publish src/BangNote.Widget -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false -o publish
```

Chép `publish/BangNote.Widget.exe` vào nơi cố định (vd: `C:\Tools\BangNote\`) rồi chạy. Lần đầu nhập **URL server** và **API key** → *Kiểm tra* → *Lưu*. Bật "Khởi động cùng Windows" trong Cài đặt hoặc menu khay.

- Kéo thả chữ đã chọn vào ô nổi, hoặc bấm vào ô rồi `Ctrl+V`.
- Sau khi lưu, bấm nút tag trong 5 giây để chuyển tag.
- Mất mạng / sai key: ghi chú được giữ ở `%AppData%\BangNote\queue.json` và tự gửi lại mỗi phút.
- Không kéo được từ app chạy bằng quyền Administrator (Windows chặn).

Không muốn cài runtime: thay `--self-contained false` bằng `--self-contained true` (file ~70MB). Test: `cd widget && dotnet test`.
````

- [ ] **Step 3: Thêm vào `docs/manual-test.md`**

```markdown
## Widget Windows
- [ ] Lần đầu chạy tự mở Cài đặt; URL sai báo lỗi; "Kiểm tra" báo số tag.
- [ ] Kéo thả từ Chrome, Word, Notepad → "Đã lưu #n"; ghi chú nguồn Widget trên web.
- [ ] Bấm tag trong 5 giây → tag đổi trên web; bấm "Chưa phân loại" → bỏ hết tag thật.
- [ ] `Ctrl+V` khi widget đang được chọn → lưu clipboard.
- [ ] Kéo file (không phải text) → không nhận.
- [ ] Mất mạng → cam "đang chờ gửi"; có mạng lại → tự gửi trong ≤ 60 giây.
- [ ] Sai API key → đỏ, ghi chú vẫn được giữ; sửa key → được gửi.
- [ ] Vị trí widget được nhớ sau khi mở lại; chạy lần hai không mở thêm cửa sổ.
- [ ] Khởi động cùng Windows bật/tắt được; Thoát xoá icon khay.
- [ ] `queue.json` hỏng → app vẫn chạy, có `queue.json.bad`.
```

- [ ] **Step 4: Cập nhật spec §8**

Trong `docs/superpowers/specs/2026-09-27-bangnote-design.md`, thay:
```
- **Hàng đợi offline**: gửi lỗi mạng/5xx → thêm vào `%AppData%\BangNote\queue.json` (ghi atomic: file tạm rồi rename), nền cam "Đang chờ gửi (n)"; timer 60 giây gửi lại theo thứ tự. Lỗi 4xx (sai key, nội dung không hợp lệ) → không đưa vào hàng đợi, báo đỏ.
```
bằng:
```
- **Hàng đợi offline**: gửi lỗi mạng/timeout/5xx → thêm vào `%AppData%\BangNote\queue.json` (ghi atomic: file tạm rồi rename), nền cam "Đang chờ gửi (n)"; timer 60 giây gửi lại theo thứ tự. Sai API key (401) → cũng vào hàng đợi để không mất chữ, báo đỏ "Sai API key — đã giữ lại…", hàng đợi dừng cho tới khi sửa key. Lỗi 4xx khác (nội dung không hợp lệ) → không vào hàng đợi, báo đỏ; nếu gặp khi gửi lại thì bỏ item đó.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs
git commit -m "docs: widget build/install guide, manual tests, spec queue rule"
```
