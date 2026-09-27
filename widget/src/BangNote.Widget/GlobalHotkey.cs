using System;
using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace BangNote.Widget;

/// <summary>Phím tắt toàn cục (Win32 RegisterHotKey) gắn vào cửa sổ WPF — vẫn nhận khi cửa sổ đang ẩn.</summary>
public sealed class GlobalHotkey : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_NOREPEAT = 0x4000;
    private const uint VK_INSERT = 0x2D;
    private const int HotkeyId = 0xB17E;

    private readonly HwndSource _source;
    private readonly Action _onPressed;

    public const string Label = "Alt+Insert";

    /// <summary>false khi ứng dụng khác đã chiếm tổ hợp phím này.</summary>
    public bool IsRegistered { get; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public GlobalHotkey(HwndSource source, Action onPressed)
    {
        _source = source;
        _onPressed = onPressed;
        IsRegistered = RegisterHotKey(source.Handle, HotkeyId, MOD_ALT | MOD_NOREPEAT, VK_INSERT);
        if (IsRegistered) source.AddHook(WndProc);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HotkeyId)
        {
            _onPressed();
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (!IsRegistered) return;
        _source.RemoveHook(WndProc);
        UnregisterHotKey(_source.Handle, HotkeyId);
    }
}
