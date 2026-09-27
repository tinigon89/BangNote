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
