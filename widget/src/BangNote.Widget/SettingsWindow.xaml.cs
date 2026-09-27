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
