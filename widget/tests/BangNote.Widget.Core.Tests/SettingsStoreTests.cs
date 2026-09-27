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
