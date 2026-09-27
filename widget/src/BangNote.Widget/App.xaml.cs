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
