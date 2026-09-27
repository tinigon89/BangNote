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
