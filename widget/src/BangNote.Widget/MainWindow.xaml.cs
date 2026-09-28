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
        SetStatus(NoteLabel.Saved(note), OkBrush);
        IReadOnlyList<TagDto> tags = _app.Tags is { } cache ? await cache.GetAsync() : [];
        RenderTags(note, tags);
        RestartRevert(TimeSpan.FromSeconds(5));
    }

    private void RenderTags(NoteDto note, IReadOnlyList<TagDto> allTags)
    {
        TagPanel.Children.Clear();
        if (note.Sub > 0)
        {
            var newPost = new Button
            {
                Content = "📌 Bài mới",
                Margin = new Thickness(2),
                Padding = new Thickness(6, 2, 6, 2),
                FontSize = 11,
                Foreground = Brushes.White,
                Background = ParseBrush("#E6334155"),
                BorderThickness = new Thickness(0),
                Cursor = Cursors.Hand,
                ToolTip = "Ghi chú này là nội dung bài viết mới",
            };
            newPost.Click += async (_, _) => await NewPostAsync();
            TagPanel.Children.Add(newPost);
        }
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
        TagPanel.Visibility = TagPanel.Children.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private async Task NewPostAsync()
    {
        if (_lastNote is not { } note || _app.SaveService.Api is not { } api || _app.Tags is not { } cache) return;
        RestartRevert(TimeSpan.FromSeconds(5));
        try
        {
            var placement = await api.NewPostAsync(note.Id);
            _lastNote = note with { Tags = placement.Tags, Position = placement.Position, Sub = placement.Sub };
            StatusText.Text = NoteLabel.Saved(_lastNote);
            RenderTags(_lastNote, cache.Current);
            RestartRevert(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex) when (ex is ApiUnavailableException or ApiRejectedException)
        {
            ShowMessage(ex.Message, ErrorBrush, TimeSpan.FromSeconds(3));
        }
    }

    private async Task ToggleTagAsync(TagDto tag)
    {
        if (_lastNote is not { } note || _app.SaveService.Api is not { } api || _app.Tags is not { } cache) return;
        RestartRevert(TimeSpan.FromSeconds(5));
        if (NoteLabel.TagIdsForPick(note, tag.Id) is not { } tagIds) return;
        try
        {
            var placement = await api.SetNoteTagsAsync(note.Id, tagIds);
            _lastNote = note with { Tags = placement.Tags, Position = placement.Position, Sub = placement.Sub };
            StatusText.Text = NoteLabel.Saved(_lastNote);
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
        var result = await _app.SaveService.FlushAsync();
        if (result.Dropped > 0)
            ShowMessage($"Đã bỏ {result.Dropped} ghi chú bị server từ chối (nội dung không hợp lệ)", ErrorBrush, TimeSpan.FromSeconds(8));
        else if (!_revertTimer.IsEnabled) ShowIdle();
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
