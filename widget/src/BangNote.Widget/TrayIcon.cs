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
        menu.Items.Add($"Hiện / Ẩn ({GlobalHotkey.Label})", null, (_, _) => window.ToggleVisibility());
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

    public void ShowWarning(string message) =>
        _icon.ShowBalloonTip(5000, "BangNote", message, Forms.ToolTipIcon.Warning);

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
    }
}
